export interface MonitoringConnection {
  enabled: boolean;
  environment: string;
  release: string;
  errorsCore: boolean;
  errorsBrowser: boolean;
  performanceCore: boolean;
  performanceBrowser: boolean;
  databaseSpans: boolean;
  tracesSampleRate: number;
}
export interface BrowserMonitoringConfig {
  enabled: boolean;
  dsn: string;
  environment: string;
  release: string;
  errors: boolean;
  performance: boolean;
  tracesSampleRate: number;
}
export interface MonitoringRouteMetrics {
  route: string;
  samples: number;
  limited: boolean;
  errors: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
}
export interface MonitoringMetrics {
  issue: "configuration_unavailable" | null;
  enabled: boolean;
  windowSeconds: number;
  maxSamplesPerRoute: number;
  maxRoutes: number;
  routesLimited: boolean;
  routes: MonitoringRouteMetrics[];
  runtime: {
    rssMb: number;
    heapUsedMb: number;
    eventLoopP99Ms: number;
    poolUsed: number;
    poolFree: number;
    poolPending: number;
  } | null;
}
/** Route templates only: no collection names, record IDs or search values. */
export function monitoringBrowserRoute(path: string): string;
/** Allowlist telemetry fields; remove bodies, headers, query strings and user content. */
export function sanitizeMonitoringEvent<T>(event: T): T;
