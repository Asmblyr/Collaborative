import { defineHandler, useAsmblyr } from "@asmblyr/kit";
import type { Overview } from "../../../shared/overview.js";

export default defineHandler((event): Overview => {
  const { actor } = useAsmblyr(event);
  return {
    viewer: {
      id: actor.id,
      kind: actor.kind,
      displayName: actor.displayName ?? null,
    },
    checkedAt: new Date().toISOString(),
  };
});
