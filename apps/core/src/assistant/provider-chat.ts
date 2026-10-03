import type OpenAI from "openai";
import type {
  ChatCompletion,
  ChatCompletionChunk,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessage,
  ChatCompletionMessageFunctionToolCall,
} from "openai/resources/chat/completions";
import {
  AssistantProviderError,
  AssistantStreamError,
} from "./provider-error.js";
import { responseMetadata } from "./telemetry/usage.js";

export type ChatParams = ChatCompletionCreateParamsNonStreaming & {
  thinking?: { type: "enabled" | "disabled" };
};

interface ChatReply {
  id?: string;
  model?: string;
  _request_id?: string | null;
  choices: {
    message: ChatCompletionMessage & { reasoning_content?: string };
    finish_reason: ChatCompletion.Choice["finish_reason"] | null;
  }[];
  usage?: ChatCompletion["usage"];
}

/** Assemble function calls and Z.ai reasoning for the next model call, not the UI. */
class ChatStreamReply {
  private readonly tools = new Map<
    number,
    ChatCompletionMessageFunctionToolCall
  >();
  readonly reply: ChatReply;

  constructor(requestId: string | null) {
    this.reply = {
      _request_id: requestId,
      choices: [
        {
          message: { role: "assistant", content: "", refusal: null },
          finish_reason: null,
        },
      ],
    };
  }

  append(chunk: ChatCompletionChunk, onDelta: (delta: string) => void) {
    this.reply.id = chunk.id;
    this.reply.model = chunk.model;
    if (chunk.usage) {
      this.reply.usage = chunk.usage;
    }
    const choice = chunk.choices.find((entry) => entry.index === 0);
    if (!choice) {
      return;
    }

    const target = this.reply.choices[0];
    const delta = choice.delta as typeof choice.delta & {
      reasoning_content?: string;
    };
    if (choice.finish_reason) {
      target.finish_reason = choice.finish_reason;
    }
    if (delta.content) {
      target.message.content += delta.content;
      onDelta(delta.content);
    }
    if (delta.refusal) {
      target.message.refusal = (target.message.refusal ?? "") + delta.refusal;
      onDelta(delta.refusal);
    }
    if (delta.reasoning_content) {
      target.message.reasoning_content =
        (target.message.reasoning_content ?? "") + delta.reasoning_content;
    }

    for (const fragment of delta.tool_calls ?? []) {
      const tool = this.tools.get(fragment.index) ?? {
        id: "",
        type: "function",
        function: { name: "", arguments: "" },
      };
      tool.id += fragment.id ?? "";
      tool.function.name += fragment.function?.name ?? "";
      tool.function.arguments += fragment.function?.arguments ?? "";
      this.tools.set(fragment.index, tool);
    }
    if (this.tools.size) {
      target.message.tool_calls = [...this.tools.entries()]
        .sort(([left], [right]) => left - right)
        .map(([, tool]) => tool);
    }
  }
}

export async function requestChatCompletion(
  client: OpenAI,
  params: ChatParams,
  signal: AbortSignal,
  onDelta?: (delta: string) => void,
): Promise<ChatReply> {
  if (!onDelta) {
    return client.chat.completions.create(params, { signal });
  }

  const { data: stream, request_id: requestId } = await client.chat.completions
    .create(
      { ...params, stream: true, stream_options: { include_usage: true } },
      { signal },
    )
    .withResponse();
  const accumulated = new ChatStreamReply(requestId);
  const metadata = () =>
    responseMetadata(accumulated.reply, "chat-completions");

  try {
    for await (const chunk of stream) {
      accumulated.append(chunk, onDelta);
    }
    if (signal.aborted) {
      throw signal.reason;
    }
    if (!accumulated.reply.choices[0].finish_reason) {
      throw new AssistantProviderError(
        502,
        "assistant_stream_interrupted",
        "Соединение прервалось до завершения ответа.",
        metadata(),
      );
    }
    return accumulated.reply;
  } catch (error) {
    throw new AssistantStreamError(error, metadata());
  }
}
