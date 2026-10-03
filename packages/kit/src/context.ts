import type { H3Event } from "h3";
import type { AsmblyrContext } from "./endpoint.js";

declare module "h3" {
  interface H3EventContext {
    asmblyr?: AsmblyrContext;
  }
}

/** Returns the authenticated host context; standalone H3 calls have no Asmblyr identity. */
export function useAsmblyr(event: H3Event): AsmblyrContext {
  const context = event.context.asmblyr;
  if (!context)
    throw new Error("Asmblyr context is unavailable outside an authenticated plugin request");
  return context;
}
