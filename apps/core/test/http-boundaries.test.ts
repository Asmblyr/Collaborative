import assert from "node:assert/strict";
import test from "node:test";
import Fastify from "fastify";
import { registerErrorHandler } from "../src/http/error-handler.js";
import { loginRateLimit } from "../src/auth/login-rate-limit.js";

test("unexpected errors hide database details and return a diagnostic request ID", async () => {
  const app = Fastify();
  registerErrorHandler(app);
  app.get("/failure", async () => {
    throw Object.assign(new Error("SELECT secret FROM private_table: password=hidden"), {
      code: "42P01",
    });
  });
  app.get("/input", async () => {
    throw Object.assign(new Error("Invalid field"), { statusCode: 400 });
  });
  try {
    const response = await app.inject("/failure");
    assert.equal(response.statusCode, 500);
    assert.equal(response.json().code, "INTERNAL_ERROR");
    assert.ok(response.json().requestId);
    assert.doesNotMatch(response.body, /SELECT|secret|private_table|password|42P01/);
    assert.equal((await app.inject("/input")).json().message, "Invalid field");
  } finally {
    await app.close();
  }
});

test("login limits normalized accounts and bounds spraying without trusting forwarded IPs", async () => {
  const app = Fastify();
  app.post("/login", { preHandler: loginRateLimit() }, async (_request, reply) =>
    reply.code(401).send({}),
  );
  const login = (email: string, forwarded: string) =>
    app.inject({
      method: "POST",
      url: "/login",
      payload: { email, password: "invalid" },
      headers: { "x-forwarded-for": forwarded },
    });
  try {
    for (let i = 0; i < 20; i++)
      assert.equal((await login("Ada@example.test", `10.0.0.${i}`)).statusCode, 401);
    const limited = await login(" ADA@EXAMPLE.TEST ", "192.0.2.1");
    assert.equal(limited.statusCode, 429);
    assert.ok(limited.headers["retry-after"]);
    assert.equal((await login("other@example.test", "192.0.2.2")).statusCode, 401);
    for (let i = 22; i < 200; i++) await login(`person${i}@example.test`, `192.0.2.${i}`);
    assert.equal((await login("fresh@example.test", "203.0.113.9")).statusCode, 429);
  } finally {
    await app.close();
  }
});
