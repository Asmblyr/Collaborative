import path from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";

const directory = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(directory, ".env") });

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is required. Copy apps/core/.env.example to apps/core/.env.");
}

export default {
  client: "pg",
  connection: process.env.DATABASE_URL,
  migrations: {
    directory: path.join(directory, "migrations"),
    extension: "cjs",
    loadExtensions: [".cjs"],
    schemaName: "public",
    tableName: "asmblyr_migrations",
  },
};
