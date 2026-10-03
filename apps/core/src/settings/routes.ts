import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import {
  requireSettingsSection,
  requireSettingsRead,
} from "../settings/access.js";
import type { AssistantService } from "../assistant/service.js";
import {
  parseAssistantDefaults,
  type AssistantDefaults,
} from "../assistant/settings.js";
import {
  loadAssistantDefaults,
  saveAssistantDefaults,
} from "../assistant/settings-repository.js";
import {
  defaultAssistantInstructions,
  maxInstructionChars,
} from "../assistant/instructions.js";
import { parseTelemetryQuery } from "../assistant/telemetry/query.js";
import { readAssistantTelemetry } from "../assistant/telemetry/repository.js";

export function registerSettingsRoutes(
  app: FastifyInstance,
  database: Knex | null,
  assistant: AssistantService | null,
) {
  const db = () => {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return database;
  };
  async function authorize(authorization?: string) {
    const user = await requireSettingsSection(
      db(),
      { headers: { authorization } },
      "assistant",
    );
    return user.id;
  }
  function snapshot(value: AssistantDefaults) {
    const status = assistant?.status();
    return {
      configured: Boolean(assistant),
      model: status?.model ?? null,
      defaults: status?.settings ?? null,
      instructionDefaults: {
        text: defaultAssistantInstructions,
        maxLength: maxInstructionChars,
      },
      value,
    };
  }
  app.get("/settings/assistant", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    await requireSettingsRead(db(), request, "assistant");
    return { data: snapshot(await loadAssistantDefaults(db())) };
  });
  app.get("/settings/assistant/telemetry", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    await requireSettingsRead(db(), request, "assistant");
    return {
      data: await readAssistantTelemetry(
        db(),
        parseTelemetryQuery(request.query),
      ),
    };
  });
  app.put(
    "/settings/assistant",
    { bodyLimit: 64_000 },
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const actorId = await authorize(request.headers.authorization);
      const value = parseAssistantDefaults(
        request.body,
        assistant?.status().settings,
        await loadAssistantDefaults(db()),
      );
      await saveAssistantDefaults(db(), actorId, value);
      return { data: snapshot(value) };
    },
  );
}
