import { createHash } from "node:crypto";
import { coreAddress } from "./session";
import type { TokenPair } from "./session";

// Route bundles must share the same rotation when requests arrive concurrently.
const state = globalThis as typeof globalThis & {
  asmblyrSessionRenewals?: Map<string, Promise<TokenPair>>;
};
const pending = state.asmblyrSessionRenewals ??= new Map<string, Promise<TokenPair>>();

export class SessionExpiredError extends Error {
  constructor() { super("Session expired"); }
}

export function renewSession(refreshToken: string): Promise<TokenPair> {
  const key = createHash("sha256").update(refreshToken).digest("hex");
  const existing = pending.get(key);
  if (existing) return existing;
  const promise = (async () => {
    const upstream = await fetch(coreAddress("/auth/refresh"), {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ refreshToken }), cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (upstream.status === 400 || upstream.status === 401) throw new SessionExpiredError();
    if (!upstream.ok) throw new Error("Core API unavailable");
    return upstream.json() as Promise<TokenPair>;
  })();
  pending.set(key, promise);
  const remove = () => { if (pending.get(key) === promise) pending.delete(key); };
  // Start the grace period only after the whole response has been received.
  void promise.then(() => { setTimeout(remove, 5000).unref(); }, remove);
  return promise;
}
