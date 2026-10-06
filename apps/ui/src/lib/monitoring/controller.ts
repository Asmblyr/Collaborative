import type { BrowserMonitoringConfig } from "@asmblyr-collaborative/contracts";

export const MONITORING_SETTINGS_CHANGED =
  "asmblyr:monitoring-settings-changed";
type StopMonitoring = () => Promise<void>;

/** Owns the asynchronous configuration and SDK lifetime, including unmount races. */
export class BrowserMonitorController {
  private readonly controller = new AbortController();
  private stop?: StopMonitoring;
  private fingerprint = "";
  private loading?: Promise<void>;

  constructor(
    private readonly load: (
      signal: AbortSignal,
    ) => Promise<BrowserMonitoringConfig>,
    private readonly start: (
      value: BrowserMonitoringConfig,
      signal: AbortSignal,
    ) => Promise<StopMonitoring | undefined>,
  ) {}

  refresh(): Promise<void> {
    if (this.controller.signal.aborted) {
      return Promise.resolve();
    }
    if (this.loading) {
      return this.loading;
    }
    const pending = this.update();
    this.loading = pending;
    void pending.finally(() => {
      if (this.loading === pending) {
        this.loading = undefined;
      }
    });
    return pending;
  }

  private async stopCurrent() {
    const stop = this.stop;
    this.stop = undefined;
    try {
      await stop?.();
    } catch {
      /* Transport failure cannot block cleanup. */
    }
  }

  private async update() {
    const signal = this.controller.signal;
    try {
      const value = await this.load(signal);
      if (signal.aborted) {
        return;
      }
      const fingerprint = JSON.stringify(value);
      if (fingerprint === this.fingerprint) {
        return;
      }
      await this.stopCurrent();
      if (signal.aborted) {
        return;
      }
      if (value.enabled && (value.errors || value.performance)) {
        const stop = await this.start(value, signal);
        if (signal.aborted) {
          try {
            await stop?.();
          } catch {
            /* Fail open. */
          }
          return;
        }
        this.stop = stop;
      }
      this.fingerprint = fingerprint;
    } catch {
      this.fingerprint = "";
      await this.stopCurrent();
    }
  }

  async close() {
    this.controller.abort();
    await this.stopCurrent();
    await this.loading;
  }
}
