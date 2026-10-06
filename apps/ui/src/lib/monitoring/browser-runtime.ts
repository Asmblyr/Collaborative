import * as Sentry from "@sentry/browser";
import {
  monitoringBrowserRoute,
  sanitizeMonitoringEvent,
  type BrowserMonitoringConfig,
} from "@asmblyr-collaborative/contracts";

function randomHex(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");
}

export function startBrowserMonitoring(
  config: BrowserMonitoringConfig,
  transport?: ConstructorParameters<
    typeof Sentry.BrowserClient
  >[0]["transport"],
): () => Promise<void> {
  const client = new Sentry.BrowserClient({
    dsn: config.dsn,
    environment: config.environment,
    release: config.release || undefined,
    integrations: [],
    transport: transport ?? Sentry.makeFetchTransport,
    stackParser: Sentry.defaultStackParser,
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
  let active = true;
  const capture = (error: unknown) => {
    if (!active) {
      return;
    }
    client.captureException(
      error,
      {
        captureContext: {
          tags: {
            component: "browser",
            route: monitoringBrowserRoute(location.pathname),
          },
        },
      },
      scope,
    );
  };
  const failed = (event: ErrorEvent) => {
    if (event.error) {
      capture(event.error);
    }
  };
  const rejected = (event: PromiseRejectionEvent) => capture(event.reason);
  if (config.errors) {
    window.addEventListener("error", failed);
    window.addEventListener("unhandledrejection", rejected);
  }
  const observers: PerformanceObserver[] = [];
  if (config.performance && typeof PerformanceObserver !== "undefined") {
    const observe = (type: "resource" | "navigation") => {
      if (!PerformanceObserver.supportedEntryTypes.includes(type)) {
        return;
      }
      const observer = new PerformanceObserver((list) => {
        if (!active) {
          return;
        }
        for (const entry of list.getEntries()) {
          if (entry.duration <= 0 || Math.random() >= config.tracesSampleRate) {
            continue;
          }
          const url = new URL(entry.name, location.origin);
          if (url.origin !== location.origin) {
            continue;
          }
          if (
            type === "resource" &&
            (!/^(?:fetch|xmlhttprequest)$/.test(
              (entry as PerformanceResourceTiming).initiatorType,
            ) ||
              !/^\/api\/(?:items|collections|files|preferences|presence|notifications|assistant)(?:\/|$)/.test(
                url.pathname,
              ))
          ) {
            continue;
          }
          const route = monitoringBrowserRoute(url.pathname);
          const start = (performance.timeOrigin + entry.startTime) / 1000;
          client.captureEvent(
            {
              type: "transaction",
              transaction: route,
              start_timestamp: start,
              timestamp: start + entry.duration / 1000,
              transaction_info: { source: "route" },
              tags: { component: "browser", route },
              contexts: {
                trace: {
                  trace_id: randomHex(16),
                  span_id: randomHex(8),
                  op: type === "navigation" ? "pageload" : "http.client",
                  data: { "sentry.sample_rate": config.tracesSampleRate },
                },
              },
              spans: [],
            },
            {},
            scope,
          );
        }
      });
      observer.observe({ type, buffered: type === "navigation" });
      observers.push(observer);
    };
    observe("resource");
    observe("navigation");
  }
  return async () => {
    active = false;
    window.removeEventListener("error", failed);
    window.removeEventListener("unhandledrejection", rejected);
    for (const observer of observers) {
      observer.disconnect();
    }
    await client.close(2000);
  };
}
