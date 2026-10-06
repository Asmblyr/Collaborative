import type {
  AssistantStatus,
  ReasoningEffort,
} from "@/components/assistant/assistant-types";

export interface AssistantDefaults {
  enabled: boolean;
  reasoningEffort: ReasoningEffort | null;
  thinking: boolean | null;
  instructions: string | null;
}

export interface AssistantSystemSettings {
  configured: boolean;
  model: string | null;
  defaults: AssistantStatus["settings"] | null;
  instructionDefaults: { text: string; maxLength: number };
  value: AssistantDefaults;
}
