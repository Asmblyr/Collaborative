import type { Middleware } from "h3";
import { EndpointError } from "./endpoint-error.js";

export type AccessMiddleware = Middleware & { readonly access: "authenticated" | "superuser" };

function gate(access: AccessMiddleware["access"]): AccessMiddleware {
  const middleware: Middleware = (event, next) => {
    const principal = event.context.asmblyrAction;
    if (!principal) throw new EndpointError(401, "UNAUTHENTICATED", "Authentication required");
    if (access === "superuser" && !principal.superuser) {
      throw new EndpointError(403, "PERMISSION_DENIED", "Permission denied");
    }
    return next();
  };
  return Object.freeze(Object.assign(middleware, { access }));
}

export const AccessGate = Object.freeze({
  authenticated: gate("authenticated"),
  superuser: gate("superuser"),
});
