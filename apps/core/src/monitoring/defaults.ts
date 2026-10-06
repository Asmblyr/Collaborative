import type { MonitoringConnection } from "@asmblyr-collaborative/contracts";

export const monitoringDefaults: MonitoringConnection = {
  enabled: false,
  environment: "production",
  release: "",
  errorsCore: true,
  errorsBrowser: true,
  performanceCore: false,
  performanceBrowser: false,
  databaseSpans: false,
  tracesSampleRate: 0.1,
};
