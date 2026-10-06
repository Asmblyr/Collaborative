/** A saved common DSN stays readable until its targets are edited. */
export const monitoringSecretSlots = [
  "monitoring.dsn",
  "monitoring.serverDsn",
  "monitoring.browserDsn",
] as const;

export const monitoringDsnNames = ["serverDsn", "browserDsn"] as const;
export type MonitoringDsnName = (typeof monitoringDsnNames)[number];

export function monitoringDsnSlot(
  secrets: Record<string, unknown>,
  name: MonitoringDsnName,
): string | undefined {
  const slot = `monitoring.${name}`;
  if (secrets[slot]) {
    return slot;
  }
  return secrets["monitoring.dsn"] ? "monitoring.dsn" : undefined;
}

export function monitoringDsnsFromEnv(
  env: NodeJS.ProcessEnv,
): Record<string, string> {
  const result: Record<string, string> = {};
  if (env.SENTRY_DSN) {
    result.serverDsn = env.SENTRY_DSN;
  }
  const browser = env.SENTRY_BROWSER_DSN || env.SENTRY_DSN;
  if (browser) {
    result.browserDsn = browser;
  }
  return result;
}
