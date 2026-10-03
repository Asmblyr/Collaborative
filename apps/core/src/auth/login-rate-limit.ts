import { createHash } from "node:crypto";
import { credentialRateLimit } from "./rate-limit.js";

// Account scope works both for direct API clients and for the Next BFF, where
// many people share one upstream IP. Untrusted forwarded headers are not used.
export function loginRateLimit() {
  const sourceLimit = credentialRateLimit(200);
  const accountLimit = credentialRateLimit(20, (request) => {
    const body = request.body;
    if (
      !body ||
      typeof body !== "object" ||
      !("email" in body) ||
      typeof body.email !== "string"
    ) {
      return `invalid:${request.ip}`;
    }
    const email = body.email.trim().toLowerCase();
    return createHash("sha256").update(email).digest("hex");
  });
  return async (...args: Parameters<typeof accountLimit>) => {
    await sourceLimit(...args);
    if (args[1].sent) return;
    await accountLimit(...args);
  };
}
