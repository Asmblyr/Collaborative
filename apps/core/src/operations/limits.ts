import { createHash, randomUUID } from "node:crypto";
import type { Knex } from "knex";
import type { FastifyInstance } from "fastify";

export interface OperationLimits {
  assistantDailyRequests: number;
  assistantConcurrent: number;
}
export const defaultOperationLimits: OperationLimits = {
  assistantDailyRequests: 100,
  assistantConcurrent: 2,
};
export function limitsFromEnv(env: NodeJS.ProcessEnv): OperationLimits {
  const read = (name: string, fallback: number, max: number) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isInteger(value) || value < 1 || value > max) {
      throw new Error(`Invalid ${name}`);
    }
    return value;
  };
  return {
    assistantDailyRequests: read("ASSISTANT_DAILY_REQUESTS", 100, 10000),
    assistantConcurrent: read("ASSISTANT_CONCURRENT_REQUESTS", 2, 10),
  };
}
export async function requestBucket(
  db: Knex,
  key: string,
  duration: number,
  limit: number,
): Promise<void> {
  const result = await db.raw(
    `INSERT INTO public.asmblyr_request_buckets (key, count, expires_at)
    VALUES (?, 1, now() + (? * interval '1 millisecond'))
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN asmblyr_request_buckets.expires_at <= now() THEN 1 ELSE asmblyr_request_buckets.count + 1 END,
      expires_at = CASE WHEN asmblyr_request_buckets.expires_at <= now() THEN EXCLUDED.expires_at ELSE asmblyr_request_buckets.expires_at END
    RETURNING count`,
    [key, duration],
  );
  if (result.rows[0].count > limit) {
    throw Object.assign(
      new Error("Достигнут лимит запросов. Попробуйте позже."),
      { statusCode: 429, code: "REQUEST_LIMIT" },
    );
  }
}
export function registerCredentialLimits(
  app: FastifyInstance,
  db: Knex | null,
): void {
  app.addHook("onRequest", async (request, reply) => {
    if (
      !db ||
      request.method !== "POST" ||
      !/^\/auth\/(?:login|setup|service-token|federation-token|invitations\/(?:accept|claim)|passkeys\/(?:options|login)|sso\/)/.test(
        request.url,
      )
    ) {
      return;
    }
    reply.header("Retry-After", "60");
    const source = createHash("sha256").update(request.ip).digest("hex");
    await requestBucket(db, `credentials:${source}`, 60000, 100);
    reply.removeHeader("Retry-After");
  });
}
export async function acquireAssistantLease(
  db: Knex,
  userId: string,
  limits: OperationLimits,
): Promise<() => Promise<void>> {
  const id = randomUUID();
  await db.transaction(async (trx) => {
    await trx("public.asmblyr_users")
      .where({ id: userId })
      .forUpdate()
      .first("id");
    const count = await trx("public.asmblyr_assistant_leases")
      .where({ user_id: userId })
      .where("expires_at", ">", trx.fn.now())
      .count<{ count: string }>("* as count")
      .first();
    if (Number(count?.count) >= limits.assistantConcurrent) {
      throw Object.assign(
        new Error("Дождитесь завершения предыдущего запроса"),
        { statusCode: 429, code: "ASSISTANT_CONCURRENT_LIMIT" },
      );
    }
    await requestBucket(
      trx,
      `assistant:${userId}:${new Date().toISOString().slice(0, 10)}`,
      86400000,
      limits.assistantDailyRequests,
    );
    // Provider timeout is at most ten minutes. Lease survives crashed workers without permanent lockout.
    await trx("public.asmblyr_assistant_leases").insert({
      id,
      user_id: userId,
      expires_at: new Date(Date.now() + 11 * 60000),
    });
  });
  return async () => {
    await db("public.asmblyr_assistant_leases").where({ id }).delete();
  };
}
