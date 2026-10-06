import type { Knex } from "knex";
import type { AssistantTurnSummary } from "@asmblyr-collaborative/contracts";
import { telemetryCursor, type TelemetryQuery } from "./query.js";

interface RequestRow {
  turn_summary: AssistantTurnSummary | null;
  turn_id: string | null;
  call_index: number;
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  started_at: Date;
  finished_at: Date | null;
  duration_ms: number | null;
  provider: string;
  api: string;
  requested_model: string;
  model: string | null;
  status: "pending" | "succeeded" | "failed" | "cancelled";
  error_code: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  total_tokens: number | null;
  cached_tokens: number | null;
  reasoning_tokens: number | null;
  reasoning_effort: string | null;
  thinking: boolean | null;
  truncated: boolean | null;
  response_id: string | null;
  request_id: string | null;
  finish_reason: string | null;
}

const pageSize = 25;

export async function readAssistantTelemetry(
  database: Knex,
  query: TelemetryQuery,
) {
  const since = new Date(query.until.getTime() - query.days * 86_400_000);
  return database.transaction(
    async (trx) => {
      const base = () => {
        const builder = trx("public.asmblyr_assistant_requests as r")
          .where("r.started_at", ">=", since)
          .where("r.started_at", "<=", query.until);
        if (query.userId) builder.where("r.user_id", query.userId);
        return builder;
      };
      const list = base()
        .leftJoin("public.asmblyr_users as u", "u.id", "r.user_id")
        .leftJoin("public.asmblyr_assistant_turns as t", "t.id", "r.turn_id")
        .select("r.*", "u.display_name", "u.email", "t.summary as turn_summary")
        .orderBy("r.started_at", "desc")
        .orderBy("r.id", "desc")
        .limit(pageSize + 1);
      if (query.before)
        list.whereRaw("(r.started_at, r.id) < (?, ?::uuid)", [
          query.before.time,
          query.before.id,
        ]);
      const rows = (await list.timeout(5000, { cancel: true })) as RequestRow[];
      const aggregate = (await base()
        .select(
          trx.raw(`
      count(*) AS requests,
      count(*) FILTER (WHERE status = 'succeeded') AS succeeded,
      count(*) FILTER (WHERE status = 'failed') AS failed,
      count(*) FILTER (WHERE status = 'cancelled') AS cancelled,
      count(*) FILTER (WHERE status = 'pending') AS pending,
      count(*) FILTER (WHERE input_tokens IS NOT NULL AND output_tokens IS NOT NULL) AS with_usage,
      sum(input_tokens) AS input_tokens, sum(output_tokens) AS output_tokens,
      sum(total_tokens) AS total_tokens, sum(cached_tokens) AS cached_tokens, sum(reasoning_tokens) AS reasoning_tokens
    `),
        )
        .first()
        .timeout(5000, { cancel: true })) as Record<string, string | null>;
      const count = (key: string) => Number(aggregate[key] ?? 0);
      const tokens = (key: string) =>
        aggregate[key] === null ? null : Number(aggregate[key]);
      const items = rows.slice(0, pageSize).map((row) => ({
        id: row.id,
        turnId: row.turn_id ?? row.id,
        callIndex: row.call_index,
        turnSummary: row.turn_summary,
        user: {
          id: row.user_id,
          displayName: row.display_name,
          email: row.email,
        },
        startedAt: row.started_at.toISOString(),
        finishedAt: row.finished_at?.toISOString() ?? null,
        durationMs: row.duration_ms,
        provider: row.provider,
        api: row.api,
        requestedModel: row.requested_model,
        model: row.model,
        status: row.status,
        errorCode: row.error_code,
        reasoningEffort: row.reasoning_effort,
        thinking: row.thinking,
        truncated: row.truncated,
        responseId: row.response_id,
        requestId: row.request_id,
        finishReason: row.finish_reason,
        usage: {
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          totalTokens: row.total_tokens,
          cachedTokens: row.cached_tokens,
          reasoningTokens: row.reasoning_tokens,
        },
      }));
      const last = rows[pageSize - 1];
      return {
        items,
        nextCursor:
          rows.length > pageSize
            ? telemetryCursor(last.started_at, last.id)
            : null,
        period: {
          days: query.days,
          from: since.toISOString(),
          until: query.until.toISOString(),
        },
        summary: {
          requests: count("requests"),
          succeeded: count("succeeded"),
          failed: count("failed"),
          cancelled: count("cancelled"),
          pending: count("pending"),
          withUsage: count("with_usage"),
          inputTokens: tokens("input_tokens"),
          outputTokens: tokens("output_tokens"),
          totalTokens: tokens("total_tokens"),
          cachedTokens: tokens("cached_tokens"),
          reasoningTokens: tokens("reasoning_tokens"),
        },
      };
    },
    { isolationLevel: "repeatable read", readOnly: true },
  );
}
