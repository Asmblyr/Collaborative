import "dotenv/config";
import { fileURLToPath } from "node:url";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import knex from "knex";
import { readSnapshot } from "./snapshot.js";
import {
  normalizationAuthor,
  normalizeAudit,
  verifyNormalizedAudit,
} from "./normalize-audit.js";

const mode = process.argv[2];
if (!["--check", "--apply", "--verify"].includes(mode))
  throw new Error("Use --check, --apply or --verify");
const authorEmail = process.env.DIRECTUS_TRANSFER_AUTHOR_EMAIL?.trim();
if (!authorEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authorEmail)) {
  throw new Error(
    "Set DIRECTUS_TRANSFER_AUTHOR_EMAIL to the intended active local account before normalization",
  );
}
const url = new URL(process.env.DATABASE_URL ?? "");
if (
  !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
  !["postgres:", "postgresql:"].includes(url.protocol)
) {
  throw new Error("Audit normalization is restricted to local PostgreSQL");
}
const directory = fileURLToPath(
  new URL("../../../../.local-data/directus-transfer/", import.meta.url),
);
const db = knex({
  client: "pg",
  connection: process.env.DATABASE_URL,
  pool: { min: 0, max: 2 },
});
const rollbackCheck = new Error("Normalization check rollback");
try {
  const snapshot = await readSnapshot(directory);
  let report: Awaited<ReturnType<typeof verifyNormalizedAudit>> = [];
  try {
    await db.transaction(async (tx) => {
      await tx.raw("SET LOCAL lock_timeout = '10s'");
      await tx.raw("SET LOCAL statement_timeout = '120s'");
      const authorId = await normalizationAuthor(tx, authorEmail);
      if (mode !== "--verify") await normalizeAudit(tx, snapshot, authorId);
      report = await verifyNormalizedAudit(tx, snapshot, authorId);
      if (mode === "--check") throw rollbackCheck;
    });
  } catch (error) {
    if (error !== rollbackCheck) throw error;
  }
  const result = {
    mode,
    completedAt: new Date().toISOString(),
    authorEmail,
    collections: report,
  };
  await writeFile(
    join(directory, `normalize-${mode.slice(2)}-report.json`),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  // Avoid including database statements or record values in error output.
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : undefined;
  const reason =
    error instanceof Error && error.message.startsWith("Transfer:")
      ? error.message.split("\n")[0]
      : "Normalization failed";
  console.error(JSON.stringify({ code, reason }));
  process.exitCode = 1;
} finally {
  await db.destroy();
}
