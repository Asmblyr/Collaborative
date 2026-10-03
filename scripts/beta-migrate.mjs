import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
const require = createRequire(
  new URL("../apps/core/package.json", import.meta.url),
);
const { S3Client, CreateBucketCommand } = require("@aws-sdk/client-s3");
const migrate = spawnSync("pnpm", ["db:migrate"], { stdio: "inherit" });
if (migrate.status !== 0) {
  process.exit(migrate.status ?? 1);
}
const client = new S3Client({
  region: "us-east-1",
  endpoint: process.env.FILES_S3_ENDPOINT,
  forcePathStyle: true,
});
try {
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      await client.send(new CreateBucketCommand({ Bucket: "asmblyr" }));
      break;
    } catch (error) {
      if (error.name === "BucketAlreadyOwnedByYou") {
        break;
      }
      if (attempt === 29) {
        throw new Error("Unable to initialize beta storage");
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
} finally {
  client.destroy();
}
