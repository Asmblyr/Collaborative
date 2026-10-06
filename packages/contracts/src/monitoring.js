export function monitoringBrowserRoute(path) {
  const parts = path.split("?")[0].split("#")[0].split("/").filter(Boolean);
  const prefix = parts[0] === "api" ? "/api" : "";
  if (prefix) {
    parts.shift();
  }
  if (parts[0] === "items") {
    return `${prefix}/items/:collection${parts.length > 2 ? "/:id" : ""}`;
  }
  if (parts[0] === "admin") {
    if (parts[1] === "settings") {
      return `${prefix}/admin/settings${parts.length > 2 ? "/:section" : ""}`;
    }
    return `${prefix}/admin/:section`;
  }
  if (prefix) {
    return "/api/:resource";
  }
  if (parts[0] === "files") {
    return "/files";
  }
  if (!parts.length) {
    return "/";
  }
  return "/:page";
}

function safeFrame(frame) {
  const file = String(frame.filename ?? "")
    .split(/[?#]/)[0]
    .replaceAll("\\", "/");
  return {
    filename: file.split("/").at(-1)?.slice(0, 160),
    function: /^[\w.$<>: -]{1,100}$/.test(frame.function ?? "")
      ? frame.function
      : undefined,
    lineno: Number.isInteger(frame.lineno) ? frame.lineno : undefined,
    colno: Number.isInteger(frame.colno) ? frame.colno : undefined,
    in_app: frame.in_app === true,
  };
}

/** The SDK gets no request data; this also defends against inherited SDK scopes. */
export function sanitizeMonitoringEvent(event) {
  const trace = event.contexts?.trace;
  const tags = {};
  for (const key of [
    "component",
    "route",
    "method",
    "http.status_code",
    "request_id",
  ]) {
    const value = event.tags?.[key];
    if (typeof value === "string" && /^[A-Za-z0-9_./: -]{1,180}$/.test(value)) {
      tags[key] = value;
    }
  }
  return {
    event_id: event.event_id,
    type: event.type,
    timestamp: event.timestamp,
    start_timestamp: event.start_timestamp,
    level: event.level,
    platform: event.platform,
    release: event.release,
    environment: event.environment,
    transaction: tags.route,
    transaction_info:
      event.type === "transaction" ? { source: "route" } : undefined,
    tags,
    contexts: trace
      ? {
          trace: {
            trace_id: trace.trace_id,
            span_id: trace.span_id,
            op: ["http.server", "http.client", "pageload"].includes(trace.op)
              ? trace.op
              : "error",
            status: ["ok", "internal_error"].includes(trace.status)
              ? trace.status
              : undefined,
            data: { "sentry.sample_rate": trace.data?.["sentry.sample_rate"] },
          },
        }
      : undefined,
    exception: event.exception
      ? {
          values: event.exception.values?.map((value) => ({
            type: [
              "Error",
              "TypeError",
              "RangeError",
              "SyntaxError",
              "ReferenceError",
              "URIError",
              "AggregateError",
            ].includes(value.type)
              ? value.type
              : "Error",
            value: "Application error (details withheld)",
            stacktrace: value.stacktrace
              ? { frames: value.stacktrace.frames?.map(safeFrame) }
              : undefined,
            mechanism: {
              type: "generic",
              handled: value.mechanism?.handled !== false,
            },
          })),
        }
      : undefined,
    spans: event.spans?.map((span) => ({
      trace_id: span.trace_id,
      span_id: span.span_id,
      parent_span_id: span.parent_span_id,
      start_timestamp: span.start_timestamp,
      timestamp: span.timestamp,
      op: "db",
      status: ["ok", "internal_error"].includes(span.status)
        ? span.status
        : undefined,
      description: [
        "SELECT",
        "INSERT",
        "UPDATE",
        "DELETE",
        "BEGIN",
        "COMMIT",
        "ROLLBACK",
        "WITH",
      ].includes(span.description)
        ? span.description
        : "Database query",
      data: { "db.system": "postgresql" },
    })),
  };
}
