import type { TestContext } from "node:test";
import { useAsmblyr } from "@asmblyr-collaborative/kit";
import { loadPlugins } from "../../src/plugins/load.js";
import { pluginItemsFixture } from "./plugin-items-fixture.js";
import { CommentsService } from "../../../../packages/plugin-comments/server/services/comments.js";
export async function notificationFixture(t: TestContext) {
  const plugins = await loadPlugins(
    new URL("../../../../package.json", import.meta.url),
    { sourcePlugins: true },
  );
  const comments = plugins.find((plugin) => plugin.namespace === "comments")!;
  const environment = await pluginItemsFixture({
    plugins: [
      {
        ...comments,
        endpoints: [
          ...comments.endpoints,
          {
            method: "POST",
            path: "/comments/rollback",
            handler: async (event) => {
              const input = await event.req.json();
              const context = useAsmblyr(event);
              await context.withRecord!(
                input.collection,
                input.item,
                async (bound) => {
                  await new CommentsService(bound).create(
                    { collection: input.collection, item: input.item },
                    { body: "Must roll back" },
                  );
                  throw new Error("Deliberate failure after inbox publication");
                },
              );
            },
          },
          {
            method: "POST",
            path: "/comments/replay",
            handler: async (event) => {
              const input = await event.req.json();
              await useAsmblyr(event).notifications!.publish(input);
              return { ok: true };
            },
          },
        ],
      },
    ],
  });
  t.after(environment.close);
  return environment;
}
