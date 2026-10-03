import type {
  AssistantProgress,
  AssistantStreamEvent,
  AssistantTurnSummary,
} from "@asmblyr/contracts";

export class AssistantResponseError extends Error {
  constructor(
    message: string,
    readonly code?: string,
    readonly summary?: AssistantTurnSummary,
  ) {
    super(message);
  }
}

/** NDJSON can split anywhere, including inside a UTF-8 character or JSON token. */
export async function* readAssistantEvents(
  response: Response,
): AsyncGenerator<AssistantStreamEvent> {
  if (
    !response.ok ||
    !response.headers.get("content-type")?.includes("application/x-ndjson")
  ) {
    const result = await response.json();
    throw new AssistantResponseError(
      result.message || "Не удалось получить ответ",
      result.code,
      result.summary,
    );
  }
  if (!response.body) throw new Error("Пустой ответ ассистента");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      pending += decoder.decode(value, { stream: !done });
      if (pending.length > 1_000_000)
        throw new Error("Ответ ассистента слишком велик");
      let boundary: number;
      while ((boundary = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, boundary);
        pending = pending.slice(boundary + 1);
        if (line.trim()) yield JSON.parse(line) as AssistantStreamEvent;
      }
      if (done) {
        if (pending.trim()) throw new Error("Ответ ассистента оборвался");
        return;
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Stop preserves the response stream so Core can send cancellation usage. */
export class AssistantRequest {
  readonly controller = new AbortController();
  stopping = false;
  text = "";
  private requestId?: string;
  private cancelSent = false;
  private fallback?: ReturnType<typeof setTimeout>;

  abort() {
    clearTimeout(this.fallback);
    this.controller.abort();
  }

  stop() {
    if (this.stopping) return;
    this.stopping = true;
    this.fallback = setTimeout(() => this.abort(), 12_000);
    void this.cancelRemote();
  }

  private async cancelRemote() {
    if (!this.requestId || !this.stopping || this.cancelSent) return;
    this.cancelSent = true;
    try {
      const response = await fetch(
        `/api/assistant/messages/${encodeURIComponent(this.requestId)}/cancel`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
          signal: AbortSignal.any([
            this.controller.signal,
            AbortSignal.timeout(10_000),
          ]),
        },
      );
      // 404 also means the answer won the race with cancellation; keep reading it.
      if (!response.ok && response.status !== 404) this.abort();
    } catch {
      this.abort();
    }
  }

  async send(
    snapshot: object,
    onProgress: (progress: AssistantProgress) => void,
    onText?: (text: string) => void,
  ) {
    let textTimer: ReturnType<typeof setTimeout> | undefined;
    let publishedText = "";
    const publishText = () => {
      clearTimeout(textTimer);
      textTimer = undefined;
      if (publishedText !== this.text) {
        publishedText = this.text;
        onText?.(this.text);
      }
    };
    try {
      const response = await fetch("/api/assistant/messages", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(snapshot),
        signal: AbortSignal.any([
          this.controller.signal,
          AbortSignal.timeout(135_000),
        ]),
      });
      for await (const event of readAssistantEvents(response)) {
        if (event.type === "started") {
          this.requestId = event.requestId;
          void this.cancelRemote();
        } else if (event.type === "progress") {
          onProgress(event.progress);
        } else if (event.type === "text-delta") {
          // A new model step starts another paragraph, not another answer.
          if (event.reset && this.text.trim()) {
            this.text = `${this.text.trimEnd()}\n\n`;
          }
          this.text += event.delta;
          // Batch tokens so Markdown renders at most once per frame-sized interval.
          textTimer ??= setTimeout(publishText, 32);
        } else if (event.type === "answer") {
          return event.data;
        } else if (event.type === "error") {
          throw new AssistantResponseError(
            event.message,
            event.code,
            event.summary,
          );
        }
      }
      throw new Error("Соединение прервалось до завершения ответа");
    } finally {
      publishText();
      clearTimeout(this.fallback);
    }
  }
}
