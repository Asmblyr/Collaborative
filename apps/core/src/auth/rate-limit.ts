import type { FastifyReply, FastifyRequest } from "fastify";

// Per-process protection. request.ip ignores forwarded headers unless Fastify trusts the proxy.
export function credentialRateLimit(
  limit = 30,
  identify: (request: FastifyRequest) => string = (request) => request.ip,
) {
  const buckets = new Map<string, { count: number; until: number }>();
  return async (request: FastifyRequest, reply: FastifyReply) => {
    reply.header("Cache-Control", "no-store");
    const now = Date.now();
    for (const [key, bucket] of buckets)
      if (bucket.until <= now) buckets.delete(key);
    const key = identify(request);
    let bucket = buckets.get(key);
    if (!bucket) {
      if (buckets.size >= 4096) {
        return reply
          .header("Retry-After", "60")
          .code(429)
          .send({ message: "Too many requests" });
      }
      bucket = { count: 0, until: now + 60_000 };
      buckets.set(key, bucket);
    }
    if (++bucket.count > limit) {
      return reply
        .header("Retry-After", String(Math.ceil((bucket.until - now) / 1000)))
        .code(429)
        .send({ message: "Too many requests" });
    }
  };
}
