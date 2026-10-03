import type OpenAI from "openai";
import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";
import {
  AssistantProviderError,
  AssistantStreamError,
} from "./provider-error.js";
import { responseMetadata } from "./telemetry/usage.js";

export async function requestResponse(
  client: OpenAI,
  params: ResponseCreateParamsNonStreaming,
  signal: AbortSignal,
  onDelta?: (delta: string) => void,
): Promise<Response> {
  if (!onDelta) {
    return client.responses.create(params, { signal });
  }

  const { data: stream, request_id: requestId } = await client.responses
    .create({ ...params, stream: true }, { signal })
    .withResponse();
  let latest: Response | undefined;
  let completed = false;
  const metadata = () =>
    responseMetadata({ ...latest, _request_id: requestId }, "responses");

  try {
    for await (const event of stream) {
      // Reasoning and function arguments never enter the public text stream.
      if (
        event.type === "response.output_text.delta" ||
        event.type === "response.refusal.delta"
      ) {
        onDelta(event.delta);
      } else if ("response" in event) {
        latest = event.response;
        completed = [
          "response.completed",
          "response.incomplete",
          "response.failed",
        ].includes(event.type);
      } else if (event.type === "error") {
        throw new AssistantProviderError(
          502,
          "assistant_failed",
          "Провайдер не смог подготовить ответ.",
          metadata(),
        );
      }
    }
    if (signal.aborted) {
      throw signal.reason;
    }
    if (!completed || !latest) {
      throw new AssistantProviderError(
        502,
        "assistant_stream_interrupted",
        "Соединение прервалось до завершения ответа.",
        metadata(),
      );
    }
    return Object.assign(latest, { _request_id: requestId });
  } catch (error) {
    throw new AssistantStreamError(error, metadata());
  }
}
