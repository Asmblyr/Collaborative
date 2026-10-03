import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import knex from "knex";
import { updateCollectionDisplay } from "../../src/collections/display.js";
import { names, readSnapshot } from "./snapshot.js";
import { createStructure, displayFields, insertRecords } from "./structure.js";
import { verifyTransfer } from "./verify.js";

const mode = process.argv[2];
if (!["--check", "--import", "--verify"].includes(mode)) throw new Error("Use --check, --import or --verify");
const url = new URL(process.env.DATABASE_URL ?? "");
if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || !["postgres:", "postgresql:"].includes(url.protocol)) {
  throw new Error("This transfer is restricted to local PostgreSQL");
}
const directory = fileURLToPath(new URL("../../../../.local-data/directus-transfer/", import.meta.url));
const db = knex({ client: "pg", connection: process.env.DATABASE_URL, pool: { min: 0, max: 2 } });
const rollbackCheck = new Error("Transfer check rollback");
let phase = "snapshot validation";
try {
  const snapshot = await readSnapshot(directory);
  let report: Awaited<ReturnType<typeof verifyTransfer>> = [];
  if (mode === "--verify") {
    phase = "verification";
    report = await verifyTransfer(db, snapshot);
  } else {
    try {
      await db.transaction(async (tx) => {
        await tx.raw("SET LOCAL lock_timeout = '10s'");
        await tx.raw("SET LOCAL statement_timeout = '120s'");
        phase = "structure creation";
        await createStructure(tx, snapshot);
        phase = "record insertion";
        await insertRecords(tx, snapshot);
        for (const name of names) {
          if (displayFields[name]) await updateCollectionDisplay(tx, name, { displayField: displayFields[name] });
        }
        phase = "verification before commit";
        report = await verifyTransfer(tx, snapshot);
        if (mode === "--check") throw rollbackCheck;
      });
    } catch (error) { if (error !== rollbackCheck) throw error; }
  }
  const result = { mode, completedAt: new Date().toISOString(), exportedAt: snapshot.metadata.exportedAt,
    total: report.reduce((sum, c) => sum + c.rows, 0), collections: report };
  await writeFile(join(directory, `${mode.slice(2)}-report.json`), JSON.stringify(result, null, 2) + "\n");
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  // PostgreSQL errors may embed INSERT parameters; never log raw errors/queries.
  const code = error && typeof error === "object" && "code" in error ? String(error.code) : undefined;
  const reason = error instanceof Error && error.message.startsWith("Transfer:") ? error.message.split("\n")[0] : "Operation failed";
  console.error(JSON.stringify({ phase, code, reason }));
  process.exitCode = 1;
} finally { await db.destroy(); }
