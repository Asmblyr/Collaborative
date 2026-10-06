import type { MonitoringConnection } from "@asmblyr-collaborative/contracts";
import { objectInput, textInput } from "../shared/input.js";
import { integrationError } from "../integrations/types.js";

import { monitoringDefaults } from "./defaults.js";
import { monitoringDsnsFromEnv } from "./dsn.js";
export { monitoringDefaults } from "./defaults.js";
export const monitoringEnvironmentNames = [
  "SENTRY_ENABLED",
  "SENTRY_DSN",
  "SENTRY_BROWSER_DSN",
  "SENTRY_ENVIRONMENT",
  "SENTRY_RELEASE",
  "SENTRY_ERRORS_CORE",
  "SENTRY_ERRORS_BROWSER",
  "SENTRY_PERFORMANCE_CORE",
  "SENTRY_PERFORMANCE_BROWSER",
  "SENTRY_DATABASE_SPANS",
  "SENTRY_TRACES_SAMPLE_RATE",
];

export function monitoringValue(input: unknown): MonitoringConnection {
  const value = objectInput(input, Object.keys(monitoringDefaults));
  const result = {} as MonitoringConnection;
  for (const key of [
    "enabled",
    "errorsCore",
    "errorsBrowser",
    "performanceCore",
    "performanceBrowser",
    "databaseSpans",
  ] as const) {
    if (typeof value[key] !== "boolean") {
      throw integrationError("integration_value_invalid");
    }
    result[key] = value[key];
  }
  for (const key of ["environment", "release"] as const) {
    result[key] = textInput(
      value[key],
      key === "environment" ? 64 : 120,
      key === "release",
    );
    if (result[key] && !/^[A-Za-z0-9_.:@/-]+$/.test(result[key])) {
      throw integrationError("integration_value_invalid");
    }
  }
  if (result.environment === "None" || result.environment.includes("/")) {
    throw integrationError("integration_value_invalid");
  }
  const rate = value.tracesSampleRate;
  if (
    typeof rate !== "number" ||
    !Number.isFinite(rate) ||
    rate < 0 ||
    rate > 1
  ) {
    throw integrationError("integration_value_invalid");
  }
  result.tracesSampleRate = rate;
  return result;
}

export function monitoringFromEnv(
  env: NodeJS.ProcessEnv,
): MonitoringConnection {
  const dsns = monitoringDsnsFromEnv(env);
  const flag = (name: string, fallback: boolean) => {
    const value = env[name]?.trim();
    if (!value) {
      return fallback;
    }
    if (value !== "true" && value !== "false") {
      throw integrationError("integration_value_invalid");
    }
    return value === "true";
  };
  return monitoringValue({
    enabled: flag("SENTRY_ENABLED", Boolean(dsns.serverDsn || dsns.browserDsn)),
    environment:
      env.SENTRY_ENVIRONMENT?.trim() || monitoringDefaults.environment,
    release: env.SENTRY_RELEASE?.trim() || "",
    errorsCore: flag("SENTRY_ERRORS_CORE", Boolean(dsns.serverDsn)),
    errorsBrowser: flag("SENTRY_ERRORS_BROWSER", Boolean(dsns.browserDsn)),
    performanceCore: flag("SENTRY_PERFORMANCE_CORE", false),
    performanceBrowser: flag("SENTRY_PERFORMANCE_BROWSER", false),
    databaseSpans: flag("SENTRY_DATABASE_SPANS", false),
    tracesSampleRate: Number(env.SENTRY_TRACES_SAMPLE_RATE?.trim() || 0.1),
  });
}

export function validateSentryDsn(value: string): string {
  try {
    const url = new URL(value);
    if (
      !url.username ||
      !/^[a-zA-Z0-9]+$/.test(url.username) ||
      url.password ||
      url.search ||
      url.hash ||
      !/\/\d+\/?$/.test(url.pathname) ||
      (url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
        ))
    ) {
      throw new Error();
    }
    return value;
  } catch {
    throw integrationError("integration_sentry_dsn_invalid");
  }
}

export function validateMonitoringDsns(
  value: MonitoringConnection,
  secrets: Record<string, string>,
) {
  for (const dsn of Object.values(secrets)) {
    validateSentryDsn(dsn);
  }
  if (!value.enabled) {
    return;
  }
  if ((value.errorsCore || value.performanceCore) && !secrets.serverDsn) {
    throw integrationError("integration_sentry_server_dsn_missing");
  }
  if (
    (value.errorsBrowser || value.performanceBrowser) &&
    !secrets.browserDsn
  ) {
    throw integrationError("integration_sentry_browser_dsn_missing");
  }
}
