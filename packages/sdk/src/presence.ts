import type { PresenceInput, PresenceResult } from "@asmblyr/contracts";
import type { RequestOptions } from "./options.js";
import type { Transport } from "./transport.js";

export interface PresenceClient {
  /** Join or renew a short-lived view; only human sessions may participate. */
  touch(
    input: PresenceInput,
    request?: RequestOptions,
  ): Promise<PresenceResult>;
  leave(clientId: string, request?: RequestOptions): Promise<void>;
}
export function createPresenceClient(transport: Transport): PresenceClient {
  return {
    touch: (input, request) =>
      transport.write("POST", "/presence", input, request),
    leave: (clientId, request) =>
      transport.write(
        "DELETE",
        `/presence/${encodeURIComponent(clientId)}`,
        undefined,
        request,
      ),
  };
}
