import assert from "node:assert/strict";
import test from "node:test";
import { assistantConfigFromEnv } from "../src/assistant/config.js";
import { createAssistantProvider, AssistantProviderError } from "../src/assistant/provider.js";
import { AssistantService } from "../src/assistant/service.js";

const config = assistantConfigFromEnv({ OPENAI_API_KEY: "test", OPENAI_API_MODEL: "test" })!;
const body = { messages: [{ role: "user", content: "test" }] };

test("transport failures distinguish local network denial from other connection failures", async () => {
  for (const code of ["EACCES", "EPERM", "ENOTFOUND", "ECONNREFUSED", "CERT_HAS_EXPIRED"]) {
    let attempts = 0;
    const provider = createAssistantProvider(config, async () => {
      attempts++;
      const cause = Object.assign(new Error("private socket details"), { code });
      throw new TypeError("private fetch failure", { cause });
    });
    const service = new AssistantService(config, provider);
    await assert.rejects(service.respond("user", body), (error) => {
      assert.ok(error instanceof AssistantProviderError);
      const denied = code === "EACCES" || code === "EPERM";
      assert.equal(error.code, denied ? "assistant_network_denied" : "assistant_network");
      assert.equal(error.summary?.errorCode, error.code);
      assert.equal(error.summary?.modelCalls, 1);
      assert.equal(error.summary?.usage.inputTokens, null);
      assert.equal(error.summary?.toolCalls, 0);
      assert.ok(!JSON.stringify(error).includes("private"));
      assert.ok(!error.message.includes("private"));
      return true;
    });
    assert.equal(attempts, 1);
  }
});

test("mixed IPv4/IPv6 failures detect denied connections inside an aggregate", async () => {
  const provider = createAssistantProvider(config, async () => {
    const causes = ["ENETUNREACH", "EACCES"].map((code) =>
      Object.assign(new Error("private"), { code }),
    );
    throw new TypeError("private", { cause: new AggregateError(causes, "private") });
  });
  await assert.rejects(new AssistantService(config, provider).respond("user", body), {
    code: "assistant_network_denied",
  });
});

test("HTTP provider errors are not mistaken for local network restrictions", async () => {
  for (const status of [401, 500]) {
    const provider = createAssistantProvider(config, async () =>
      Response.json(
        {
          error: { code: "EACCES", message: "private provider message" },
        },
        { status },
      ),
    );
    await assert.rejects(new AssistantService(config, provider).respond("user", body), {
      code: status === 401 ? "assistant_configuration" : "assistant_unavailable",
    });
  }
});
