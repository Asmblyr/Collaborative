import { monitorEventLoopDelay } from "node:perf_hooks";
import type { FastifyInstance } from "fastify";
import type {
  BrowserMonitoringConfig,
  MonitoringMetrics,
  MonitoringConnection,
} from "@asmblyr-collaborative/contracts";
import type { IntegrationService } from "../integrations/service.js";
import {
  monitoringDefaults,
  monitoringFromEnv,
  monitoringValue,
  validateMonitoringDsns,
} from "./config.js";
import { monitoringDsnsFromEnv, monitoringSecretSlots } from "./dsn.js";
import { RollingMetrics } from "./metrics.js";
import { DatabaseSpans } from "./database.js";
import {
  createSentrySink,
  type MonitoringSink,
  type MonitoringSinkFactory,
} from "./sentry.js";

import { registerRequestMonitoring } from "./hooks.js";

export class MonitoringRuntime {
  private value: MonitoringConnection = monitoringDefaults;
  private sink?: MonitoringSink;
  private fingerprint = "";
  private loading?: Promise<void>;
  private closed = false;
  private issue: MonitoringMetrics["issue"] = null;
  private browserDsn = "";
  private delay = monitorEventLoopDelay({ resolution: 20 });
  readonly metrics = new RollingMetrics();
  private readonly sql: DatabaseSpans;
  constructor(
    private readonly settings: IntegrationService,
    private readonly factory: MonitoringSinkFactory = createSentrySink,
    private readonly random = Math.random,
  ) {
    this.sql = new DatabaseSpans(settings.database);
  }
  get collectPerformance() {
    return this.value.enabled && this.value.performanceCore;
  }

  refresh(): Promise<void> {
    if (this.closed) {
      return Promise.resolve();
    }
    if (this.loading) {
      return this.loading;
    }
    const update = this.update();
    this.loading = update;
    void update.finally(() => {
      if (this.loading === update) {
        this.loading = undefined;
      }
    });
    return update;
  }
  private async update() {
    try {
      const row = await this.settings.row();
      const locked = this.settings.locked("monitoring");
      const value = locked
        ? monitoringFromEnv(this.settings.providers.options.env)
        : monitoringValue(this.settings.values(row).monitoring);
      const env = this.settings.providers.options.env;
      const fingerprint = JSON.stringify([
        value,
        locked,
        locked
          ? monitoringDsnsFromEnv(env)
          : [
              ...monitoringSecretSlots.map((slot) => row.secrets[slot]),
              this.settings.values(row).encryption,
            ],
      ]);
      if (this.fingerprint === fingerprint || this.closed) {
        return;
      }
      let secrets: Record<string, string> = {};
      if (locked) {
        secrets = monitoringDsnsFromEnv(env);
      } else if (value.enabled) {
        secrets = await this.settings.reveal(row, "monitoring");
      }
      validateMonitoringDsns(value, secrets);
      const next =
        value.enabled && (value.errorsCore || value.performanceCore)
          ? await this.factory(value, secrets.serverDsn)
          : undefined;
      if (this.closed) {
        await next?.close();
        return;
      }
      const previous = this.sink;
      this.sink = next;
      this.value = value;
      this.browserDsn = value.enabled ? (secrets.browserDsn ?? "") : "";
      this.fingerprint = fingerprint;
      this.issue = null;
      this.sql.setEnabled(this.collectPerformance && value.databaseSpans);
      if (this.collectPerformance) {
        this.delay.enable();
      } else {
        this.delay.disable();
        this.delay.reset();
        this.metrics.clear();
      }
      try {
        await previous?.close();
      } catch {
        /* Old transport shutdown cannot disable the new configuration. */
      }
    } catch {
      const previous = this.sink;
      this.sink = undefined;
      this.value = monitoringDefaults;
      this.browserDsn = "";
      this.fingerprint = "";
      this.issue = "configuration_unavailable";
      this.sql.setEnabled(false);
      this.delay.disable();
      this.metrics.clear();
      try {
        await previous?.close();
      } catch {
        /* Monitoring never blocks the application. */
      }
    }
  }
  browserConfig(): BrowserMonitoringConfig {
    const enabled =
      this.value.enabled &&
      Boolean(this.browserDsn) &&
      (this.value.errorsBrowser || this.value.performanceBrowser);
    return {
      enabled,
      dsn: enabled ? this.browserDsn : "",
      environment: this.value.environment,
      release: this.value.release,
      errors: enabled && this.value.errorsBrowser,
      performance: enabled && this.value.performanceBrowser,
      tracesSampleRate: enabled ? this.value.tracesSampleRate : 0,
    };
  }
  snapshot(): MonitoringMetrics {
    const pool = this.settings.database.client.pool;
    const memory = process.memoryUsage();
    return {
      issue: this.issue,
      enabled: this.collectPerformance,
      windowSeconds: this.metrics.windowSeconds,
      maxSamplesPerRoute: this.metrics.maxSamplesPerRoute,
      maxRoutes: this.metrics.maxRoutes,
      routesLimited: this.metrics.routesLimited,
      routes: this.collectPerformance ? this.metrics.snapshot() : [],
      runtime: this.collectPerformance
        ? {
            rssMb: Math.round(memory.rss / 1048576),
            heapUsedMb: Math.round(memory.heapUsed / 1048576),
            eventLoopP99Ms:
              this.delay.count > 0
                ? Number((this.delay.percentile(99) / 1e6).toFixed(2))
                : 0,
            poolUsed: pool?.numUsed() ?? 0,
            poolFree: pool?.numFree() ?? 0,
            poolPending: pool?.numPendingAcquires() ?? 0,
          }
        : null,
    };
  }
  register(app: FastifyInstance) {
    registerRequestMonitoring(app, {
      config: () => this.value,
      sink: () => this.sink,
      metrics: this.metrics,
      sql: this.sql,
      random: this.random,
    });
    let timer: NodeJS.Timeout | undefined;
    app.addHook("onReady", async () => {
      await this.refresh();
      timer = setInterval(() => void this.refresh(), 5000);
      timer.unref();
    });
    app.addHook("onClose", async () => {
      clearInterval(timer);
      await this.close();
    });
  }
  async close() {
    this.closed = true;
    await this.loading;
    this.sql.setEnabled(false);
    this.delay.disable();
    this.metrics.clear();
    try {
      await this.sink?.close();
    } catch {
      /* Application shutdown remains independent of Sentry. */
    }
    this.sink = undefined;
  }
}
