import assert from "node:assert/strict";
import { createClient, ApiError } from "@asmblyr-collaborative/sdk";
import {
  useAsmblyr,
  type ItemCommitDraft,
  type JsonRecord,
} from "@asmblyr-collaborative/kit";
import { readBody } from "h3";
import type { LoadedPlugin } from "../../src/plugins/definition.js";
import { pluginItemsFixture } from "./plugin-items-fixture.js";

const writer: LoadedPlugin = {
  name: "writer",
  capabilities: ["items.read", "items.write"],
  definition: {},
  endpoints: [
    {
      method: "POST",
      path: "/writer/:operation",
      handler: async (event) => {
        const body = await readBody<{
          collection: string;
          id: string | number;
          values: JsonRecord;
          draft: ItemCommitDraft;
        }>(event);
        assert.ok(body);
        const { items } = useAsmblyr(event);
        switch (event.context.params?.operation) {
          case "create":
            return items.create(body.collection, body.values);
          case "update":
            return items.update(body.collection, body.id, body.values);
          case "delete":
            await items.delete(body.collection, body.id);
            event.res.status = 204;
            return;
          case "commit":
            return items.commit(body.collection, body.draft);
          default:
            throw new Error("Unknown test operation");
        }
      },
    },
  ],
};

export async function pluginWritesFixture() {
  const fixture = await pluginItemsFixture({ plugins: [writer] });
  const baseUrl = await fixture.app.listen({ host: "127.0.0.1", port: 0 });
  function http(token: string) {
    return createClient({ baseUrl, accessToken: token }).items;
  }
  function kit(token: string) {
    async function invoke<Result>(
      operation: string,
      payload: object,
    ): Promise<Result> {
      const response = await fixture.app.inject({
        method: "POST",
        url: `/writer/${operation}`,
        headers: { authorization: `Bearer ${token}` },
        payload,
      });
      if (response.statusCode >= 400) {
        const error = response.json();
        throw new ApiError(
          error.message,
          response.statusCode,
          error.code,
          error.requestId,
        );
      }
      return response.statusCode === 204 ? undefined : response.json();
    }
    type Writes = Pick<
      ReturnType<typeof http>,
      "create" | "update" | "delete" | "commit"
    >;
    const items: Writes = {
      create: (collection, values) => invoke("create", { collection, values }),
      update: (collection, id, values) =>
        invoke("update", { collection, id, values }),
      delete: (collection, id) => invoke("delete", { collection, id }),
      commit: (collection, draft) => invoke("commit", { collection, draft }),
    };
    return items;
  }
  return { ...fixture, http, kit };
}
