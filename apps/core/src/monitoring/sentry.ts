import { randomBytes } from "node:crypto";
import type { NodeOptions, Event } from "@sentry/node";
import {
  sanitizeMonitoringEvent,
  type MonitoringConnection,
} from "@asmblyr-collaborative/contracts";

export interface RequestMeasurement {
  route: string;
  method: string;
  requestId: string;
  started: number;
  timestamp: number;
  duration: number;
  status: number;
  sampled: boolean;
  finished: boolean;
  spans: NonNullable<Event["spans"]>;
  traceId: string;
  spanId: string;
}
export interface MonitoringSink {
  error(
    error: unknown,
    route: string,
    method: string,
    requestId: string,
    status: number,
  ): void;
  transaction(measurement: RequestMeasurement): void;
  close(): Promise<void>;
}
export type MonitoringSinkFactory = (
  value: MonitoringConnection,
  dsn: string,
) => Promise<MonitoringSink>;

export async function createSentrySink(
  value: MonitoringConnection,
  dsn: string,
  transport?: NodeOptions["transport"],
): Promise<MonitoringSink> {
  const Sentry = await import("@sentry/node");
  const client = new Sentry.NodeClient({
    dsn,
    environment: value.environment,
    release: value.release || undefined,
    integrations: [],
    transport: transport ?? Sentry.makeNodeTransport,
    stackParser: Sentry.defaultStackParser,
    enableOpenTelemetrySetup: false,
    enableRuntimeChannelInjection: false,
    includeServerName: false,
    sendClientReports: false,
    traceLifecycle: "static",
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
      frameContextLines: 0,
      genAI: { inputs: false, outputs: false },
      graphQL: { document: false, variables: false },
    },
    beforeSendLog: () => null,
    beforeSendMetric: () => null,
    beforeSend: sanitizeMonitoringEvent,
    beforeSendTransaction: sanitizeMonitoringEvent,
    transportOptions: { bufferSize: 30 },
  });
  client.init();
  const scope = new Sentry.Scope();
  scope.setClient(client);
  return {
    error(error, route, method, requestId, status) {
      const original =
        error instanceof Error ? error : new Error("Core request failed");
      client.captureException(
        original,
        {
          captureContext: {
            tags: {
              component: "core",
              route,
              method,
              request_id: requestId,
              "http.status_code": String(status),
            },
          },
        },
        scope,
      );
    },
    transaction(measurement) {
      client.captureEvent(
        {
          type: "transaction",
          transaction: measurement.route,
          start_timestamp: measurement.timestamp,
          timestamp: measurement.timestamp + measurement.duration / 1000,
          transaction_info: { source: "route" },
          contexts: {
            trace: {
              trace_id: measurement.traceId,
              span_id: measurement.spanId,
              op: "http.server",
              status: measurement.status >= 500 ? "internal_error" : "ok",
              data: { "sentry.sample_rate": value.tracesSampleRate },
            },
          },
          tags: {
            component: "core",
            route: measurement.route,
            method: measurement.method,
            "http.status_code": String(measurement.status),
            request_id: measurement.requestId,
          },
          spans: measurement.spans,
        },
        {},
        scope,
      );
    },
    async close() {
      await client.close(2000);
    },
  };
}
export const traceId = () => randomBytes(16).toString("hex");
export const spanId = () => randomBytes(8).toString("hex");
