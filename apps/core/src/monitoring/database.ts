import { AsyncLocalStorage } from "node:async_hooks";
import { performance } from "node:perf_hooks";
import type { Knex } from "knex";
import type { RequestMeasurement } from "./sentry.js";
import { spanId } from "./sentry.js";

interface Query {
  __knexQueryUid?: string;
  sql?: string;
}
/** SQL operation + timings only; never statements, bindings, results or table names. */
export class DatabaseSpans {
  readonly context = new AsyncLocalStorage<RequestMeasurement>();
  private pending = new Map<
    string,
    { request: RequestMeasurement; start: number; operation: string }
  >();
  private attached = false;
  constructor(private readonly database: Knex) {}
  private readonly begin = (query: Query) => {
    const request = this.context.getStore();
    if (
      !request?.sampled ||
      request.finished ||
      !query.__knexQueryUid ||
      request.spans.length >= 100 ||
      this.pending.size >= 1000
    ) {
      return;
    }
    const operation =
      query.sql
        ?.trim()
        .match(
          /^(SELECT|INSERT|UPDATE|DELETE|BEGIN|COMMIT|ROLLBACK|WITH)\b/i,
        )?.[1]
        .toUpperCase() ?? "QUERY";
    this.pending.set(query.__knexQueryUid, {
      request,
      start: performance.now(),
      operation,
    });
  };
  private finish(query: Query, failed: boolean) {
    const key = query.__knexQueryUid;
    if (!key) {
      return;
    }
    const pending = this.pending.get(key);
    if (!pending) {
      return;
    }
    this.pending.delete(key);
    const request = pending.request;
    if (request.spans.length >= 100) {
      return;
    }
    request.spans.push({
      trace_id: request.traceId,
      parent_span_id: request.spanId,
      span_id: spanId(),
      op: "db",
      description: pending.operation,
      status: failed ? "internal_error" : "ok",
      start_timestamp:
        request.timestamp + (pending.start - request.started) / 1000,
      timestamp:
        request.timestamp + (performance.now() - request.started) / 1000,
      data: { "db.system": "postgresql" },
    });
  }
  private readonly response = (_result: unknown, query: Query) =>
    this.finish(query, false);
  private readonly failure = (_error: unknown, query: Query) =>
    this.finish(query, true);
  setEnabled(enabled: boolean) {
    if (enabled === this.attached) {
      return;
    }
    this.attached = enabled;
    if (enabled) {
      this.database.on("query", this.begin);
      this.database.on("query-response", this.response);
      this.database.on("query-error", this.failure);
    } else {
      this.database.off("query", this.begin);
      this.database.off("query-response", this.response);
      this.database.off("query-error", this.failure);
      this.pending.clear();
    }
  }
  clearRequest(request: RequestMeasurement) {
    for (const [key, value] of this.pending) {
      if (value.request === request) {
        this.pending.delete(key);
      }
    }
  }
}
