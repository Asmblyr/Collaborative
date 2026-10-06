import type { MonitoringRouteMetrics } from "@asmblyr-collaborative/contracts";

interface Observation {
  at: number;
  duration: number;
  error: boolean;
}
interface Series {
  values: Observation[];
  cursor: number;
  limitedUntil: number;
}

/** Exact nearest-rank percentiles of bounded recent observations, per instance. */
export class RollingMetrics {
  readonly windowSeconds = 900;
  readonly maxSamplesPerRoute = 2000;
  readonly maxRoutes = 128;
  private series = new Map<string, Series>();
  private routesLimitedUntil = 0;
  constructor(private readonly clock = Date.now) {}

  record(route: string, duration: number, status: number) {
    if (!Number.isFinite(duration) || duration < 0) {
      return;
    }
    const at = this.clock();
    let series = this.series.get(route);
    if (!series) {
      for (const [key, value] of this.series) {
        if (
          value.values.every(
            (sample) => sample.at < at - this.windowSeconds * 1000,
          )
        ) {
          this.series.delete(key);
        }
      }
      if (this.series.size >= this.maxRoutes) {
        this.routesLimitedUntil = at + this.windowSeconds * 1000;
        return;
      }
      series = { values: [], cursor: 0, limitedUntil: 0 };
      this.series.set(route, series);
    }
    const sample = { at, duration, error: status >= 500 };
    if (series.values.length < this.maxSamplesPerRoute) {
      series.values.push(sample);
    } else {
      if (series.values[series.cursor].at >= at - this.windowSeconds * 1000) {
        series.limitedUntil = at + this.windowSeconds * 1000;
      }
      series.values[series.cursor] = sample;
      series.cursor = (series.cursor + 1) % this.maxSamplesPerRoute;
    }
  }
  clear() {
    this.series.clear();
    this.routesLimitedUntil = 0;
  }
  get routesLimited() {
    return this.routesLimitedUntil > this.clock();
  }
  snapshot(): MonitoringRouteMetrics[] {
    const since = this.clock() - this.windowSeconds * 1000;
    const routes: MonitoringRouteMetrics[] = [];
    for (const [route, series] of this.series) {
      const samples = series.values.filter((value) => value.at >= since);
      if (!samples.length) {
        this.series.delete(route);
        continue;
      }
      const sorted = samples
        .map((value) => value.duration)
        .sort((a, b) => a - b);
      const percentile = (fraction: number) =>
        Number(
          sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)].toFixed(
            2,
          ),
        );
      routes.push({
        route,
        samples: samples.length,
        limited: series.limitedUntil > this.clock(),
        errors: samples.filter((value) => value.error).length,
        p50Ms: percentile(0.5),
        p95Ms: percentile(0.95),
        p99Ms: percentile(0.99),
      });
    }
    return routes.sort((a, b) => b.p99Ms - a.p99Ms);
  }
}
