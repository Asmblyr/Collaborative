// Runs before fixtures can connect, including when a test file is invoked directly.
const name = process.env.ASMBLYR_TEST_DATABASE;
const connection = process.env.DATABASE_URL;

if (!name || !/^asmblyr_test_[a-f0-9]{32}$/.test(name) || !connection) {
  throw new Error(
    "Integration tests require an isolated database. Use pnpm test:integration.",
  );
}

const url = new URL(connection);
const isolatedCiService =
  process.env.CI === "true" &&
  process.env.TEST_DATABASE_ADMIN_URL &&
  url.hostname === "postgres";
if (
  url.pathname !== `/${name}` ||
  (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) &&
    !isolatedCiService)
) {
  throw new Error(
    "Refusing to run integration tests against the application database",
  );
}
