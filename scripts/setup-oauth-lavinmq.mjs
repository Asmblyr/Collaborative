import { copyFile, mkdir, constants } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const directory = path.join(root, ".local-data/oauth-lavinmq");
await mkdir(directory, { recursive: true });
try {
  await copyFile(
    path.join(root, "infra/oauth-lavinmq/lavinmq.ini.example"),
    path.join(directory, "lavinmq.ini"),
    constants.COPYFILE_EXCL,
  );
  console.log("Created local HTTP demo configuration");
} catch (error) {
  if (error.code !== "EEXIST") throw error;
  console.log("Preserved existing LavinMQ configuration");
}
console.log("Set OAUTH_ISSUER_URL=http://localhost:3000/oauth in apps/core/.env");
console.log("Set client_id in .local-data/oauth-lavinmq/lavinmq.ini, then run:");
console.log("docker compose -f infra/oauth-lavinmq/compose.yaml up -d");
