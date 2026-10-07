import { createRequire } from "node:module";
import "../container/migrate.mjs";
const require = createRequire(
  new URL("../../apps/core/package.json", import.meta.url),
);
const { S3Client, CreateBucketCommand } = require("@aws-sdk/client-s3");
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
        throw new Error("Unable to initialize local storage");
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
} finally {
  client.destroy();
}
