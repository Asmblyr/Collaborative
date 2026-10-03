import { randomUUID } from "node:crypto";
import type { FastifyReply } from "fastify";
import type { AssistantStreamEvent } from "@asmblyr/contracts";

/** Process-local, like AssistantService concurrency. Cancel requests must reach this Core. */
export class AssistantRequests {
  private readonly pending = new Map<string, { userId: string; controller: AbortController }>();

  add(userId: string, controller: AbortController) {
    const id = randomUUID();
    this.pending.set(id, { userId, controller });
    return id;
  }

  cancel(id: string, userId: string): boolean {
    const request = this.pending.get(id);
    if (!request || request.userId !== userId) return false;
    request.controller.abort();
    return true;
  }

  remove(id: string) {
    this.pending.delete(id);
  }
}

export function openResponseStream(reply: FastifyReply, controller: AbortController) {
  reply.hijack();
  for (const [name, value] of Object.entries(reply.getHeaders())) {
    if (value !== undefined) reply.raw.setHeader(name, value);
  }
  reply.raw.writeHead(200, {
    "content-type": "application/x-ndjson; charset=utf-8",
    "cache-control": "no-store, no-transform",
    "x-accel-buffering": "no",
  });
  return (event: AssistantStreamEvent) => {
    if (reply.raw.destroyed || reply.raw.writableEnded) return;
    // A slow or disconnected consumer must not accumulate an unbounded event queue.
    reply.raw.write(`${JSON.stringify(event)}\n`);
    if (reply.raw.writableLength > 256_000) controller.abort();
  };
}
