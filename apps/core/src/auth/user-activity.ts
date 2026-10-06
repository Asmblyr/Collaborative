import type { Knex } from "knex";

const intervalMs = 5 * 60 * 1000;
const caches = new WeakMap<Knex, Map<string, number>>();

/** Approximate authenticated activity, bounded to one write per five minutes. */
export async function recordUserActivity(
  db: Knex,
  userId: string,
): Promise<void> {
  let cache = caches.get(db);
  if (!cache) {
    cache = new Map();
    caches.set(db, cache);
  }
  const now = Date.now();
  if ((cache.get(userId) ?? 0) > now) {
    return;
  }
  if (cache.size >= 1000) {
    cache.clear();
  }
  cache.set(userId, now + intervalMs);
  try {
    await db("public.asmblyr_users")
      .where({ id: userId })
      .where((query) => {
        query
          .whereNull("last_active_at")
          .orWhere("last_active_at", "<", new Date(now - intervalMs));
      })
      .update({ last_active_at: db.fn.now() });
  } catch (error) {
    cache.delete(userId);
    throw error;
  }
}
