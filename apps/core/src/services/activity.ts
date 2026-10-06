import { AsyncLocalStorage } from "node:async_hooks";
import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";

const requests = new AsyncLocalStorage<Map<string, Promise<void>>>();

export function registerServiceActivity(app: FastifyInstance): void {
  app.addHook("onRequest", (_request, _reply, done) => {
    requests.run(new Map(), done);
  });
}

/** Count successful key-backed authentication once within the current HTTP request. */
export async function recordServiceRequest(
  db: Knex,
  keyId: string,
): Promise<void> {
  const current = requests.getStore();
  if (!current) {
    return;
  }

  let recorded = current.get(keyId);
  if (!recorded) {
    recorded = db("asmblyr_service_keys")
      .withSchema("public")
      .where({ id: keyId })
      .update({
        request_count: db.raw("request_count + 1"),
        last_activity_at: db.raw(
          "greatest(last_activity_at, clock_timestamp())",
        ),
      })
      .then(() => {});
    current.set(keyId, recorded);
  }
  await recorded;
}
