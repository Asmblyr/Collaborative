import type { Knex } from "knex";
/** Bounded batches. Business history is retained unless retention is explicitly enabled. */
export async function cleanupOperations(
  db: Knex,
  historyDays = 0,
): Promise<number> {
  let deleted = 0;
  const prune = async (table: string, column: string, cutoff: Date) => {
    const result = await db.raw(
      `DELETE FROM ?? AS target USING
      (SELECT ctid FROM ?? WHERE ?? < ? LIMIT 1000 FOR UPDATE SKIP LOCKED) AS victims
      WHERE target.ctid = victims.ctid RETURNING target.ctid`,
      [table, table, column, cutoff],
    );
    deleted += result.rowCount;
  };
  const now = new Date();
  await prune("public.asmblyr_cli_grants", "expires_at", now);
  await prune("public.asmblyr_connection_secrets", "expires_at", now);
  await prune("public.asmblyr_passkey_challenges", "expires_at", now);
  await prune("public.asmblyr_request_buckets", "expires_at", now);
  await prune("public.asmblyr_assistant_leases", "expires_at", now);
  await prune(
    "public.asmblyr_auth_sessions",
    "expires_at",
    new Date(Date.now() - 7 * 86400000),
  );
  if (historyDays > 0) {
    const cutoff = new Date(Date.now() - historyDays * 86400000);
    await prune("public.asmblyr_assistant_requests", "started_at", cutoff);
    await prune("public.asmblyr_assistant_turns", "started_at", cutoff);
    await prune("public.asmblyr_assistant_conversations", "updated_at", cutoff);
    await prune("public.asmblyr_item_events", "occurred_at", cutoff);
    await prune("public.asmblyr_file_events", "created_at", cutoff);
  }
  return deleted;
}
