import { generateUiRegistry } from "@asmblyr/kit/node";
import { fileURLToPath } from "node:url";

await generateUiRegistry(
  new URL("../../../package.json", import.meta.url),
  fileURLToPath(new URL("../src/generated/plugin-ui.ts", import.meta.url)),
  true,
);
