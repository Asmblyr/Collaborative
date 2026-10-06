import { performance } from "node:perf_hooks";
import type { FastifyInstance, FastifyRequest } from "fastify";
import type { MonitoringConnection } from "@asmblyr-collaborative/contracts";
import type { DatabaseSpans } from "./database.js";
import type { RollingMetrics } from "./metrics.js";
import {
  spanId,
  traceId,
  type MonitoringSink,
  type RequestMeasurement,
} from "./sentry.js";

interface RequestMonitoring {
  config(): MonitoringConnection;
  sink(): MonitoringSink | undefined;
  sql: DatabaseSpans;
  metrics: RollingMetrics;
  random(): number;
}

export function registerRequestMonitoring(
  app: FastifyInstance,
  monitor: RequestMonitoring,
) {
  const requests = new WeakMap<FastifyRequest, RequestMeasurement>();
  const route = (request: FastifyRequest) =>
    request.routeOptions.url ?? "/unmatched";
  const included = (path: string) =>
    !/^\/(?:health|ready|auth|oauth|connections|monitoring)(?:\/|$)/.test(
      path,
    ) &&
    !path.startsWith("/settings/integrations") &&
    path !== "/settings/monitoring" &&
    path !== "/unmatched";

  app.addHook("onRequest", (request, _reply, done) => {
    const value = monitor.config();
    const path = route(request);
    if (!value.enabled || !value.performanceCore || !included(path)) {
      done();
      return;
    }
    const sampled = value.tracesSampleRate > monitor.random();
    const measurement: RequestMeasurement = {
      route: `${request.method} ${path}`,
      method: request.method,
      requestId: request.id,
      started: performance.now(),
      timestamp: Date.now() / 1000,
      duration: 0,
      status: 0,
      sampled,
      finished: false,
      spans: [],
      traceId: sampled ? traceId() : "",
      spanId: sampled ? spanId() : "",
    };
    requests.set(request, measurement);
    if (sampled && value.databaseSpans) {
      monitor.sql.context.run(measurement, done);
    } else {
      done();
    }
  });
  app.addHook("onError", async (request, _reply, error) => {
    const value = monitor.config();
    if (!value.enabled || !value.errorsCore || !included(route(request))) {
      return;
    }
    const status = error.statusCode ?? 500;
    if (status < 500) {
      return;
    }
    try {
      monitor
        .sink()
        ?.error(
          error,
          `${request.method} ${route(request)}`,
          request.method,
          request.id,
          status,
        );
    } catch {
      /* Fail open. */
    }
  });
  app.addHook("onResponse", async (request, reply) => {
    const measurement = requests.get(request);
    if (!measurement) {
      return;
    }
    measurement.finished = true;
    monitor.sql.clearRequest(measurement);
    requests.delete(request);
    const value = monitor.config();
    if (!value.enabled || !value.performanceCore) {
      return;
    }
    measurement.duration = performance.now() - measurement.started;
    measurement.status = reply.statusCode;
    monitor.metrics.record(
      measurement.route,
      measurement.duration,
      measurement.status,
    );
    if (measurement.sampled) {
      try {
        monitor.sink()?.transaction(measurement);
      } catch {
        /* Fail open. */
      }
    }
  });
  const abort = async (request: FastifyRequest) => {
    const measurement = requests.get(request);
    if (measurement) {
      measurement.finished = true;
      monitor.sql.clearRequest(measurement);
    }
    requests.delete(request);
  };
  app.addHook("onRequestAbort", abort);
  app.addHook("onTimeout", abort);
}
