import "./support/require-test-database.js";
import assert from "node:assert/strict";
import { randomUUID, randomBytes } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import test from "node:test";
import knex from "knex";
import pg from "pg";
import { createApp } from "../src/app.js";
import { issueUserTokens } from "../src/auth/tokens.js";
import { IntegrationService } from "../src/integrations/service.js";
import { monitoringDefaults } from "../src/monitoring/config.js";
import { createSentrySink } from "../src/monitoring/sentry.js";

/** Opt-in measurements use the runner's disposable DB, never the installation. */
test(
  "API performance on a generated catalog",
  {
    skip: process.env.ASMBLYR_PERFORMANCE_AUDIT !== "1",
  },
  async (t) => {
    const db = knex({ client: "pg", connection: process.env.DATABASE_URL });
    const monitoring = process.env.ASMBLYR_PERFORMANCE_MONITORING ?? "absent";
    const sampleRate = Number(process.env.ASMBLYR_PERFORMANCE_SAMPLE_RATE ?? 1);
    assert.ok(
      Number.isFinite(sampleRate) && sampleRate >= 0 && sampleRate <= 1,
    );
    assert.ok(["absent", "disabled", "enabled"].includes(monitoring));
    const integrations =
      monitoring === "absent"
        ? undefined
        : {
            env: { SECRETS_LOCAL_KEY: randomBytes(32).toString("base64url") },
          };
    let sentEvents = 0;
    const name = "performance_products";
    const [user] = await db("asmblyr_users")
      .insert({ email: `${randomUUID()}@example.test`, superuser: true })
      .returning("id");
    const headers = {
      authorization: `Bearer ${(await issueUserTokens(db, user.id)).accessToken}`,
    };
    if (integrations && monitoring === "enabled") {
      const settings = new IntegrationService(db, integrations);
      await settings.save(
        "monitoring",
        {
          revision: (await settings.row()).revision,
          value: {
            ...monitoringDefaults,
            enabled: true,
            errorsBrowser: false,
            performanceCore: true,
            databaseSpans: true,
            tracesSampleRate: sampleRate,
          },
          secrets: { dsn: "https://abc@example.test/1" },
        },
        user.id,
      );
    }
    const app = createApp({
      databaseUrl: process.env.DATABASE_URL,
      logger: false,
      integrations,
      monitoringSink: (value, dsn) =>
        createSentrySink(value, dsn, () => ({
          send() {
            sentEvents++;
            return Promise.resolve({});
          },
          flush() {
            return Promise.resolve(true);
          },
        })),
    });
    t.after(async () => {
      await app.close();
      await db.destroy();
    });
    for (let index = 0; index < 40; index++) {
      const result = await app.inject({
        method: "POST",
        url: "/collections",
        headers,
        payload: {
          name: index === 0 ? name : `performance_catalog_${index}`,
          primaryKey: { name: "id", type: "serial" },
          fields: [
            { name: "title", type: "text" },
            { name: "description", type: "text" },
            { name: "status", type: "text" },
          ],
        },
      });
      assert.equal(result.statusCode, 201, result.body);
    }
    await db.raw(
      `INSERT INTO ?? (title, description, status)
    SELECT CASE WHEN i % 10 = 0 THEN 'корм ' || i ELSE 'товар ' || i END,
      repeat('описание ', 8), CASE WHEN i % 2 = 0 THEN 'published' ELSE 'draft' END
    FROM generate_series(1, 20000) i`,
      [name],
    );
    await db.raw("ANALYZE ??", [name]);
    const delay = monitorEventLoopDelay({ resolution: 10 });
    delay.enable();
    t.after(() => delay.disable());
    const original = pg.Client.prototype.query;
    let queries = 0;
    const searchQueries = new Map<
      string,
      { text: string; values: unknown[] }
    >();
    let captureSearch = true;
    Object.defineProperty(pg.Client.prototype, "query", {
      configurable: true,
      writable: true,
      value: function (this: pg.Client, ...args: unknown[]) {
        queries++;
        const query = args[0] as { text?: string; values?: unknown[] };
        if (
          captureSearch &&
          query?.text?.includes('from "public"."performance_products"')
        ) {
          const kind = query.text.includes("count(") ? "count" : "data";
          if (!searchQueries.has(kind)) {
            searchQueries.set(kind, {
              text: query.text,
              values: query.values ?? [],
            });
          }
        }
        return Reflect.apply(original, this, args);
      },
    });
    t.after(() =>
      Object.defineProperty(pg.Client.prototype, "query", {
        configurable: true,
        writable: true,
        value: original,
      }),
    );
    const searchResponse = await app.inject({
      url: `/items/${name}?limit=50&q=${encodeURIComponent("корм")}`,
      headers,
    });
    assert.equal(searchResponse.statusCode, 200);
    captureSearch = false;
    const plans: Record<string, unknown> = {};
    const planner = new pg.Client({
      connectionString: process.env.DATABASE_URL,
    });
    await planner.connect();
    try {
      for (const [kind, query] of searchQueries) {
        const result = await planner.query({
          text: `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.text}`,
          values: query.values,
        });
        plans[kind] = result.rows[0]["QUERY PLAN"];
      }
    } finally {
      await planner.end();
    }
    const results: object[] = [];
    const percentile = (values: number[], fraction: number) => {
      const sorted = [...values].sort((a, b) => a - b);
      return Number(
        sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)].toFixed(2),
      );
    };
    for (const [scenario, url] of [
      ["list", `/items/${name}?limit=50`],
      ["search", `/items/${name}?limit=50&q=${encodeURIComponent("корм")}`],
      ["deep-page", `/items/${name}?limit=50&page=350`],
    ]) {
      for (let index = 0; index < 10; index++) {
        const response = await app.inject({ url, headers });
        assert.equal(response.statusCode, 200, response.body);
      }
      for (const concurrency of [1, 8]) {
        const durations: number[] = [];
        const count = 200;
        const beforeQueries = queries;
        const start = performance.now();
        for (let offset = 0; offset < count; offset += concurrency) {
          await Promise.all(
            Array.from(
              { length: Math.min(concurrency, count - offset) },
              async () => {
                const requestStart = performance.now();
                const response = await app.inject({ url, headers });
                durations.push(performance.now() - requestStart);
                assert.equal(response.statusCode, 200, response.body);
                assert.equal(response.json().data.length, 50);
              },
            ),
          );
        }
        results.push({
          scenario,
          concurrency,
          count,
          p50Ms: percentile(durations, 0.5),
          p95Ms: percentile(durations, 0.95),
          p99Ms: percentile(durations, 0.99),
          requestsPerSecond: Number(
            ((count * 1000) / (performance.now() - start)).toFixed(2),
          ),
          sqlPerRequest: (queries - beforeQueries) / count,
        });
      }
    }
    const report = {
      searchPlans: plans,
      runtime: process.version,
      rows: 20000,
      collections: 40,
      monitoring,
      sampleRate: monitoring === "enabled" ? sampleRate : null,
      sentEvents,
      transport:
        "Fastify inject, real local PostgreSQL, human superuser; no browser/network",
      results,
      eventLoopP99Ms: Number((delay.percentile(99) / 1e6).toFixed(2)),
      memoryMb: Math.round(process.memoryUsage().rss / 1048576),
    };
    console.log(JSON.stringify(report));
    if (process.env.ASMBLYR_PERFORMANCE_REPORT) {
      await writeFile(
        process.env.ASMBLYR_PERFORMANCE_REPORT,
        JSON.stringify(report, null, 2),
      );
    }
  },
);
