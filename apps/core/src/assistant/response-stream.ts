import type { FastifyReply } from "fastify";
import type { AssistantStreamEvent } from "@asmblyr-collaborative/contracts";

export function openResponseStream(
  reply: FastifyReply,
  controller: AbortController,
) {
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
