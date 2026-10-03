import type OpenAI from "openai";
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from "openai/resources/chat/completions";
import type { ResponseInput } from "openai/resources/responses/responses";
import type { AssistantConfig } from "./config.js";
import type { AssistantInput } from "./validation.js";
import type { AssistantToolDefinition } from "./tool-contract.js";
import { AssistantProviderError, type AssistantAnswer } from "./provider.js";
import { responseMetadata } from "./telemetry/usage.js";
import { requestChatCompletion } from "./provider-chat.js";
import { requestResponse } from "./provider-responses.js";

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}
export interface ProviderStep extends AssistantAnswer {
  calls: ToolCall[];
}

// Continuations are in memory for this turn only. In particular, preserve reasoning
// alongside tool calls for both Responses and Z.ai; never send it to the UI or logs.
export function providerConversation(
  client: OpenAI,
  config: AssistantConfig,
  input: AssistantInput,
  instructions: string,
  definitions: AssistantToolDefinition[],
  signal: AbortSignal,
) {
  const responses: ResponseInput = [...input.messages];
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: instructions },
    ...input.messages,
  ];
  return {
    async next(onDelta?: (delta: string) => void): Promise<ProviderStep> {
      const contextBytes = Buffer.byteLength(
        JSON.stringify(
          config.api === "responses"
            ? { instructions, responses, definitions }
            : { messages, definitions },
        ),
      );
      if (contextBytes > 100000) {
        throw new AssistantProviderError(
          429,
          "assistant_context_limit",
          "Контекст слишком велик. Начните новый диалог или запросите меньше данных.",
        );
      }
      if (config.api === "responses") {
        const response = await requestResponse(
          client,
          {
            model: config.model,
            instructions,
            input: responses,
            store: false,
            max_output_tokens: config.maxOutputTokens,
            ...(definitions.length
              ? {
                  tools: definitions.map((d) => ({
                    type: "function" as const,
                    ...d,
                    strict: true,
                  })),
                  parallel_tool_calls: false,
                  include: ["reasoning.encrypted_content" as const],
                }
              : {}),
            ...(input.reasoningEffort
              ? {
                  reasoning: {
                    effort: input.reasoningEffort as "low" | "medium" | "high",
                  },
                }
              : {}),
          },
          signal,
          onDelta,
        );
        const metadata = responseMetadata(response, config.api);
        if (
          response.status !== "completed" &&
          response.status !== "incomplete"
        ) {
          throw new AssistantProviderError(
            502,
            "assistant_failed",
            "Провайдер не смог подготовить ответ.",
            metadata,
          );
        }
        const calls = response.output.flatMap((item) =>
          item.type === "function_call"
            ? [{ id: item.call_id, name: item.name, arguments: item.arguments }]
            : [],
        );
        responses.push(
          ...response.output.filter(
            (item) =>
              item.type === "function_call" ||
              item.type === "reasoning" ||
              item.type === "message",
          ),
        );
        const content =
          response.output_text ||
          response.output
            .flatMap((item) =>
              item.type === "message"
                ? item.content.flatMap((part) => {
                    if (part.type === "output_text") {
                      return [part.text];
                    }
                    if (part.type === "refusal") {
                      return [part.refusal];
                    }
                    return [];
                  })
                : [],
            )
            .join("\n");
        return {
          content,
          truncated: response.status === "incomplete",
          metadata,
          calls,
        };
      }
      const params: ChatCompletionCreateParamsNonStreaming & {
        thinking?: { type: "enabled" | "disabled" };
      } = {
        model: config.model,
        messages,
        ...(config.zai
          ? { max_tokens: config.maxOutputTokens }
          : { max_completion_tokens: config.maxOutputTokens, store: false }),
        ...(config.thinking !== "unsupported"
          ? { thinking: { type: input.thinking ? "enabled" : "disabled" } }
          : {}),
        ...(input.reasoningEffort && input.thinking
          ? {
              reasoning_effort:
                input.reasoningEffort as ChatCompletionCreateParamsNonStreaming["reasoning_effort"],
            }
          : {}),
        ...(definitions.length
          ? {
              tools: definitions.map((d) => ({
                type: "function" as const,
                function: { ...d, ...(config.zai ? {} : { strict: true }) },
              })),
              tool_choice: "auto",
              ...(config.zai ? {} : { parallel_tool_calls: false }),
            }
          : {}),
      };
      const response = await requestChatCompletion(
        client,
        params,
        signal,
        onDelta,
      );
      const choice = response.choices?.[0];
      // Both SDK responses and our stream accumulator retain Z.ai reasoning.
      if (choice?.message) {
        messages.push(choice.message as ChatCompletionMessageParam);
      }
      return {
        content: choice?.message.content || choice?.message.refusal || "",
        truncated: choice?.finish_reason === "length",
        metadata: responseMetadata(response, config.api),
        calls:
          choice?.message.tool_calls?.flatMap((call) =>
            call.type === "function"
              ? [
                  {
                    id: call.id,
                    name: call.function.name,
                    arguments: call.function.arguments,
                  },
                ]
              : [],
          ) ?? [],
      };
    },
    result(call: ToolCall, result: object) {
      const content = JSON.stringify(result);
      responses.push({
        type: "function_call_output",
        call_id: call.id,
        output: content,
      });
      messages.push({ role: "tool", tool_call_id: call.id, content });
    },
  };
}
