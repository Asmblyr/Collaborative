import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import {
  loadAccess,
  requireHuman,
  AccessDeniedError,
} from "../permissions/access.js";
import { AssistantProviderError } from "./provider.js";
import type { AssistantService } from "./service.js";
import type { PluginActions } from "../plugins/actions.js";
import { loadAssistantDefaults } from "./settings-repository.js";
import { createAssistantJournal } from "./telemetry/journal.js";
import { createContextTools, validateFilterProposal } from "./context-tools.js";
import { validateSelection } from "./selections.js";
import { AssistantRequests, openResponseStream } from "./response-stream.js";
import {
  acquireAssistantLease,
  defaultOperationLimits,
  type OperationLimits,
} from "../operations/limits.js";

export function registerAssistantRoutes(
  app: FastifyInstance,
  database: Knex | null,
  assistant: AssistantService | null,
  actions?: PluginActions,
  limits: OperationLimits = defaultOperationLimits,
) {
  const requests = new AssistantRequests();
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
      ![...access.grants.keys()].some((key) =>
        /:(read|create|update)$/.test(key),
      )
    )
      throw new AccessDeniedError();
    return access;
  }

  app.get("/assistant/status", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    await authorize(request.headers.authorization);
    if (!assistant) return { data: { available: false } };
    return { data: assistant.status(await loadAssistantDefaults(database!)) };
  });

  app.post(
    "/assistant/messages",
    { bodyLimit: 160_000 },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const access = await authorize(request.headers.authorization);
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
      try {
        const defaults = await loadAssistantDefaults(database!);
        if (request.headers.accept?.includes("application/x-ndjson")) {
          requestId = requests.add(access.principal.id, controller);
          emit = openResponseStream(reply, controller);
          emit({ type: "started", requestId });
        }
        const data = await assistant.respond(
          access.principal.id,
          request.body,
          controller.signal,
          defaults,
          journal,
          (context) =>
            createContextTools(
              database!,
              access,
              context,
              () => authorize(request.headers.authorization),
              actions,
            ),
          (progress) => emit?.({ type: "progress", progress }),
          emit ? (event) => emit?.(event) : undefined,
        );
        if (emit) {
          emit({ type: "answer", data });
          return;
        }
        return { data };
      } catch (error) {
        if (emit) {
          if (error instanceof AssistantProviderError) {
            emit({
              type: "error",
              code: error.code,
              message: error.message,
              summary: error.summary,
            });
          } else {
            emit({
              type: "error",
              code: "assistant_request_failed",
              message:
                "Не удалось выполнить запрос. Проверьте контекст и повторите попытку.",
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
        });
      } finally {
        await release().catch(() =>
          app.log.warn("Assistant lease cleanup failed"),
        );
        if (requestId) requests.remove(requestId);
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
      if (!requests.cancel(request.params.id, access.principal.id)) {
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
