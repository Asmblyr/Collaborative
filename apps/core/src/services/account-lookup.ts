import type { Knex } from "knex";

export async function requireAccount(db: Knex, id: string, lock = false) {
  const query = db("asmblyr_service_accounts").withSchema("public").where({ id });
  if (lock) query.forUpdate();
  const row = await query.first<{ id: string; status: string }>("id", "status");
  if (!row) throw Object.assign(new Error("Service account not found"), { statusCode: 404 });
  return row;
}
