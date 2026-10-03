import { AuthInputError } from "../auth/validation.js";
import { objectInput } from "../shared/input.js";
import type { AssistantConfig, ReasoningEffort } from "./config.js";
import { maxInstructionChars } from "./instructions.js";

export interface AssistantDefaults {
  enabled: boolean;
  reasoningEffort: ReasoningEffort | null;
  thinking: boolean | null;
  instructions: string | null;
}

export interface AssistantCapabilities {
  reasoningOptions: ReasoningEffort[];
  thinking: "required" | "optional" | "unsupported";
}

export const initialAssistantDefaults: AssistantDefaults = {
  enabled: true,
  reasoningEffort: null,
  thinking: null,
  instructions: null,
};

export function parseAssistantDefaults(
  value: unknown,
  capabilities?: AssistantCapabilities,
  current = initialAssistantDefaults,
): AssistantDefaults {
  const body = objectInput(value, ["enabled", "reasoningEffort", "thinking", "instructions"]);
  if (typeof body.enabled !== "boolean") throw new AuthInputError("Expected enabled boolean");
  if (
    body.reasoningEffort !== null &&
    !capabilities?.reasoningOptions.includes(body.reasoningEffort as ReasoningEffort)
  ) {
    throw new AuthInputError("Unsupported reasoning effort");
  }
  if (
    body.thinking !== null &&
    (typeof body.thinking !== "boolean" || capabilities?.thinking !== "optional")
  ) {
    throw new AuthInputError("Unsupported thinking setting");
  }
  // Older clients can still save the original settings without erasing custom instructions.
  const instructions = body.instructions === undefined ? current.instructions : body.instructions;
  if (
    instructions !== null &&
    (typeof instructions !== "string" ||
      !instructions.trim() ||
      instructions.length > maxInstructionChars ||
      /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(instructions))
  ) {
    throw new AuthInputError(`Инструкции должны содержать от 1 до ${maxInstructionChars} символов`);
  }
  return {
    enabled: body.enabled,
    reasoningEffort: body.reasoningEffort as ReasoningEffort | null,
    thinking: body.thinking as boolean | null,
    instructions: instructions === null ? null : (instructions as string).trim(),
  };
}

// Stored overrides may outlive a model change. Unsupported values fall back to Core defaults.
export function applyAssistantDefaults(
  config: AssistantConfig,
  defaults: AssistantDefaults,
): AssistantConfig {
  return {
    ...config,
    defaultEffort:
      defaults.reasoningEffort && config.reasoningOptions.includes(defaults.reasoningEffort)
        ? defaults.reasoningEffort
        : config.defaultEffort,
    defaultThinking:
      config.thinking === "optional" && defaults.thinking !== null
        ? defaults.thinking
        : config.defaultThinking,
  };
}
