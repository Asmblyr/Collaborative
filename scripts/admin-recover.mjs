import { createRequire } from "node:module";
import { randomBytes } from "node:crypto";
import { open, unlink } from "node:fs/promises";
import { clearRecoveredAccess } from "../apps/core/dist/auth/recover-access.js";
const require = createRequire(
  new URL("../apps/core/package.json", import.meta.url),
);
const knex = require("knex"),
  argon2 = require("argon2");
const [email, output] = process.argv.slice(2);
if (!email || !output || !process.env.DATABASE_URL) {
  throw new Error(
    "Usage: DATABASE_URL=... node scripts/admin-recover.mjs ADMIN_EMAIL NEW_PRIVATE_FILE",
  );
}
// Exclusive private output is created before changing the account. Never print credentials.
const file = await open(output, "wx", 0o600);
const password = randomBytes(32).toString("base64url");
const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
});
const db = knex({
  client: "pg",
  connection: process.env.DATABASE_URL,
  pool: { min: 0, max: 1 },
});
let committed = false;
try {
  await file.writeFile(JSON.stringify({ email, password }, null, 2));
  await file.sync();
  await db.transaction(async (trx) => {
    const user = await trx("public.asmblyr_users")
      .where({
        email: email.trim().toLowerCase(),
        status: "active",
        superuser: true,
      })
      .forUpdate()
      .first("id");
    if (!user) throw new Error("Active administrator not found");
    await clearRecoveredAccess(trx, user.id);
    await trx("public.asmblyr_recovery_links")
      .where({ user_id: user.id })
      .delete();
    await trx("public.asmblyr_password_credentials").insert({
      user_id: user.id,
      password_hash: hash,
    });
    await trx("public.asmblyr_security_events").insert({
      actor_id: user.id,
      action: "user.operator_recovery",
      subject_id: user.id,
      details: "{}",
    });
  });
  committed = true;
  console.log(
    "Administrator recovered. Previous sessions, sign-in methods and OAuth consents revoked; credential saved privately.",
  );
} finally {
  await file.close();
  await db.destroy();
  if (!committed) await unlink(output);
}
