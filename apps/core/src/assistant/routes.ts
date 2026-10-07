import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import {
  loadAccess,
  requireHuman,
  AccessDeniedError,
} from "../permissions/access.js";
import { AssistantProviderError } from "./provider.js";
import type { AssistantService } from "./service.js";
import type { AssistantConversationReceipt } from "@asmblyr-collaborative/contracts";
import {
  resolveRuntime,
  type RuntimeSource,
} from "../shared/runtime-source.js";
import type { PluginActions } from "../plugins/actions.js";
import { loadAssistantDefaults } from "./settings-repository.js";
import { createAssistantJournal } from "./telemetry/journal.js";
import { createContextTools, validateFilterProposal } from "./context-tools.js";
import { validateSelection } from "./selections.js";
import { openResponseStream } from "./response-stream.js";
import { AssistantRequests } from "./requests.js";
import { registerAssistantHistoryRoutes } from "./history-routes.js";
import { parseConversationSubmission } from "./history-input.js";
import {
  beginSavedTurn,
  finishSavedTurn,
  type SavedTurn,
} from "./history-turn.js";
import { prepareConversationHistory } from "./history-context.js";
import {
  acquireAssistantLease,
  defaultOperationLimits,
  type OperationLimits,
} from "../operations/limits.js";
import type { GoogleConnections } from "../connections/google/connections.js";

export function registerAssistantRoutes(
  app: FastifyInstance,
  database: Knex | null,
  assistantSource: RuntimeSource<AssistantService>,
  actions?: PluginActions,
  limits: OperationLimits = defaultOperationLimits,
  google: GoogleConnections | null = null,
) {
  const requests = new AssistantRequests(database, () =>
    app.log.warn("Assistant cancellation check failed"),
  );
  app.addHook("preClose", async () => requests.close());
  const journal = database
    ? createAssistantJournal(database, (id) =>
        app.log.warn(
          { requestId: id },
          "Assistant telemetry finalization failed",
        ),
      )
    : undefined;
  async function authorize(authorization?: string) {
    if (!database)
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    const access = await loadAccess(database, authorization);
    requireHuman(access);
    if (
      !access.principal.superuser &&
      !(google && (await google.available(access.principal.id))) &&
      ![...access.grants.keys()].some((key) =>
        /:(read|create|update)$/.test(key),
      )
    )
      throw new AccessDeniedError();
    return access;
  }

  if (database) {
    registerAssistantHistoryRoutes(app, database, authorize);
  }

  app.get("/assistant/status", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    await authorize(request.headers.authorization);
    const assistant = await resolveRuntime(assistantSource);
    if (!assistant) return { data: { available: false } };
    return { data: assistant.status(await loadAssistantDefaults(database!)) };
  });

  app.post(
    "/assistant/messages",
    { bodyLimit: 160_000 },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const access = await authorize(request.headers.authorization);
      const assistant = await resolveRuntime(assistantSource);
      if (!assistant)
        return reply.code(503).send({
          code: "assistant_disabled",
          message: "Ассистент не настроен",
        });
      const controller = new AbortController();
      const release = await acquireAssistantLease(
        database!,
        access.principal.id,
        limits,
      );
      const disconnect = () => {
        if (!reply.raw.writableEnded) controller.abort();
      };
      reply.raw.on("close", disconnect);
      let requestId: string | undefined;
      let emit: ReturnType<typeof openResponseStream> | undefined;
      let savedTurn: SavedTurn | undefined;
      let saved = false;
      let publicText = "";
      try {
        const defaults = await loadAssistantDefaults(database!);
        const submission = parseConversationSubmission(request.body);
        if (submission) {
          savedTurn = await beginSavedTurn(
            database!,
            access.principal.id,
            submission,
          );
          if (savedTurn.cached) {
            if (request.headers.accept?.includes("application/x-ndjson")) {
              emit = openResponseStream(reply, controller);
              emit({ type: "answer", data: savedTurn.cached });
              return;
            }
            return { data: savedTurn.cached };
          }
        }
        if (request.headers.accept?.includes("application/x-ndjson")) {
          requestId = await requests.add(access.principal.id, controller);
          emit = openResponseStream(reply, controller);
          emit({ type: "started", requestId });
        }
        const data = await assistant.respond(
          access.principal.id,
          submission
            ? {
                messages: [{ role: "user", content: submission.content }],
                settings: submission.settings,
                context: submission.context,
                ...(submission.dataAccess
                  ? { dataAccess: submission.dataAccess }
                  : {}),
              }
            : request.body,
          controller.signal,
          defaults,
          journal,
          (context, dataAccess) =>
            createContextTools(
              database!,
              access,
              context,
              () => authorize(request.headers.authorization),
              actions,
              google,
              dataAccess,
            ),
          (progress) => emit?.({ type: "progress", progress }),
          emit
            ? (event) => {
                if (!event.provisional) {
                  if (event.reset) {
                    publicText = "";
                  }
                  publicText += event.delta;
                }
                emit?.(event);
              }
            : undefined,
          savedTurn
            ? prepareConversationHistory(
                database!,
                access.principal.id,
                savedTurn,
              )
            : undefined,
          (activity) => emit?.({ type: "activity", activity }),
        );
        const conversation = savedTurn
          ? await finishSavedTurn(database!, access.principal.id, savedTurn, {
              content: data.content,
              activity: data.activity,
              status: "completed",
              summary: data.summary,
              truncated: data.truncated,
            })
          : undefined;
        saved = true;
        const answer = { ...data, ...(conversation ? { conversation } : {}) };
        if (emit) {
          emit({ type: "answer", data: answer });
          return;
        }
        return { data: answer };
      } catch (error) {
        let conversation: AssistantConversationReceipt | undefined;
        if (savedTurn && !saved && !savedTurn.cached) {
          const cancelled =
            controller.signal.aborted ||
            (error instanceof AssistantProviderError &&
              error.code === "assistant_cancelled");
          conversation = await finishSavedTurn(
            database!,
            access.principal.id,
            savedTurn,
            {
              content:
                publicText ||
                (cancelled
                  ? "Запрос остановлен."
                  : "Не удалось завершить ответ."),
              status: cancelled ? "cancelled" : "failed",
              summary:
                error instanceof AssistantProviderError
                  ? (error.summary ?? null)
                  : null,
              activity:
                error instanceof AssistantProviderError
                  ? error.activity
                  : undefined,
              truncated: false,
            },
          ).catch(() => {
            app.log.warn(
              { conversationId: savedTurn!.conversationId },
              "Assistant history finalization failed",
            );
            return undefined;
          });
        }
        if (emit) {
          if (error instanceof AssistantProviderError) {
            emit({
              type: "error",
              code: error.code,
              message: error.message,
              summary: error.summary,
              activity: error.activity,
              ...(conversation ? { conversation } : {}),
            });
          } else {
            emit({
              type: "error",
              code: "assistant_request_failed",
              message:
                "Не удалось выполнить запрос. Проверьте контекст и повторите попытку.",
              ...(conversation ? { conversation } : {}),
            });
          }
          return;
        }
        if (!(error instanceof AssistantProviderError)) throw error;
        if (error.statusCode === 429) reply.header("Retry-After", "60");
        return reply.code(error.statusCode).send({
          code: error.code,
          message: error.message,
          summary: error.summary,
          activity: error.activity,
          ...(conversation ? { conversation } : {}),
        });
      } finally {
        await release().catch(() =>
          app.log.warn("Assistant lease cleanup failed"),
        );
        if (requestId)
          await requests
            .remove(requestId)
            .catch(() => app.log.warn("Assistant cancellation cleanup failed"));
        if (emit && !reply.raw.destroyed) reply.raw.end();
        reply.raw.off("close", disconnect);
      }
    },
  );

  app.post<{ Params: { id: string } }>(
    "/assistant/messages/:id/cancel",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const access = await authorize(request.headers.authorization);
      if (!(await requests.cancel(request.params.id, access.principal.id))) {
        return reply
          .code(404)
          .send({ message: "Запрос уже завершён или недоступен" });
      }
      return { data: { stopping: true } };
    },
  );

  app.post(
    "/assistant/selection/validate",
    { bodyLimit: 80000 },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const access = await authorize(request.headers.authorization);
      return { data: await validateSelection(database!, access, request.body) };
    },
  );

  app.post(
    "/assistant/filter/validate",
    { bodyLimit: 80000 },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const access = await authorize(request.headers.authorization);
      return {
        data: await validateFilterProposal(database!, access, request.body),
      };
    },
  );
}
