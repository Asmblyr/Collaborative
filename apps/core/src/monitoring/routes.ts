import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { requireSuperuser } from "../auth/require-superuser.js";
import { authenticateAccess } from "../auth/tokens.js";
import { integrationError } from "../integrations/types.js";
import type { MonitoringRuntime } from "./runtime.js";

export function registerMonitoringRoutes(
  app: FastifyInstance,
  database: Knex | null,
  runtime: MonitoringRuntime | null,
) {
  const db = () => {
    if (!database) {
      throw integrationError("integration_configuration_invalid", 503);
    }
    return database;
  };
  app.get("/monitoring/browser", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    await authenticateAccess(db(), request.headers.authorization);
    return {
      data: runtime?.browserConfig() ?? {
        enabled: false,
        dsn: "",
        environment: "",
        release: "",
        errors: false,
        performance: false,
        tracesSampleRate: 0,
      },
    };
  });
  app.get("/settings/monitoring", async (request, reply) => {
    reply.header("Cache-Control", "private, no-store");
    await requireSuperuser(db(), request);
    return {
      data: runtime?.snapshot() ?? {
        issue: "configuration_unavailable",
        enabled: false,
        windowSeconds: 900,
        maxSamplesPerRoute: 2000,
        maxRoutes: 128,
        routesLimited: false,
        routes: [],
        runtime: null,
      },
    };
  });
}
