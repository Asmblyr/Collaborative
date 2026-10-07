import type { TestContext } from "node:test";
import type { AddressInfo } from "node:net";
import type { FastifyInstance } from "fastify";
import { createPublicServer } from "../../src/http/public-server.js";

export async function publicServer(t: TestContext, app: FastifyInstance) {
  await app.ready();
  // UI intentionally unavailable: these requests must be handled by Core alone.
  const server = createPublicServer(app, "http://127.0.0.1:1");
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(async () => {
    server.closePublicConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}
