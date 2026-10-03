import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
export async function checksum(file) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(file)) hash.update(chunk);
  return hash.digest("hex");
}
