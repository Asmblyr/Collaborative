import type { AssistantActivity } from "@asmblyr-collaborative/contracts";

/** Bounded public annotations only; private reasoning and tool payloads stay elsewhere. */
export function createAssistantActivity(
  emit?: (activity: AssistantActivity) => void,
) {
  const entries: AssistantActivity[] = [];
  let chars = 0;
  return {
    append(entry: AssistantActivity) {
      if (!entry.text.trim() || entries.length >= 64 || chars >= 64_000) {
        return;
      }
      const text = entry.text.slice(0, Math.min(8000, 64_000 - chars));
      const previous = entries.at(-1);
      if (previous?.kind === entry.kind && previous.text === text) {
        return;
      }
      const activity = { kind: entry.kind, text };
      entries.push(activity);
      chars += text.length;
      emit?.(activity);
    },
    snapshot(): AssistantActivity[] {
      return entries.map((entry) => ({ ...entry }));
    },
  };
}
