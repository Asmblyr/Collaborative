import { generateKeyPairSync, randomBytes, randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const file = path.resolve(process.argv[2] ?? ".local-data/oauth-keys.json");
const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 3072 });
const key = {
  ...privateKey.export({ format: "jwk" }),
  kid: randomUUID(),
  alg: "RS256",
  use: "sig",
};
await mkdir(path.dirname(file), { recursive: true });
// Refuse to replace a live signing/storage key. Losing it invalidates encrypted state and secrets.
await writeFile(
  file,
  JSON.stringify(
    {
      jwks: { keys: [key] },
      cookieKeys: [randomBytes(32).toString("base64url")],
      storageKey: randomBytes(32).toString("base64url"),
    },
    null,
    2,
  ),
  { flag: "wx", mode: 0o600 },
);
console.log(`OAuth keys created: ${file}`);
