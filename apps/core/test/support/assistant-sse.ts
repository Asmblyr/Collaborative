/** Real SDK SSE decoding, with a controllable stream for timing and abort tests. */
export function assistantSse(signal?: AbortSignal | null) {
  let controller: ReadableStreamDefaultController<Uint8Array>;
  let closed = false;
  const encode = new TextEncoder();
  const abort = () => {
    if (!closed) {
      closed = true;
      controller.error(
        signal?.reason ?? new DOMException("Aborted", "AbortError"),
      );
    }
  };
  const body = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value;
      if (signal?.aborted) abort();
      else signal?.addEventListener("abort", abort, { once: true });
    },
    cancel() {
      closed = true;
      signal?.removeEventListener("abort", abort);
    },
  });
  return {
    response: new Response(body, {
      headers: {
        "content-type": "text/event-stream",
        "x-request-id": "stream-request",
      },
    }),
    send(event: object) {
      controller.enqueue(encode.encode(`data: ${JSON.stringify(event)}\n\n`));
    },
    end() {
      signal?.removeEventListener("abort", abort);
      if (closed) return;
      closed = true;
      controller.enqueue(encode.encode("data: [DONE]\n\n"));
      controller.close();
    },
  };
}

export function chatChunk(delta: object, finishReason: string | null = null) {
  return {
    id: "chat-stream",
    model: "actual-model",
    choices: [{ index: 0, delta, finish_reason: finishReason }],
  };
}
