import { createRequire } from "node:module";
import config from "../../apps/core/knexfile.mjs";

const require = createRequire(
  new URL("../../apps/core/package.json", import.meta.url),
);
const database = require("knex")(config);
try {
  const [batch, migrations] = await database.migrate.latest();
  console.log(`Migration batch ${batch}: ${migrations.length} applied`);
} finally {
  await database.destroy();
}
