import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { compose, containerId, docker, projectName } from "./beta/docker.mjs";
const [envFile, projectInput, privateFile, origin = "http://localhost:3301"] =
  process.argv.slice(2);
const project = projectName(projectInput);
if (
  !project.startsWith("asmblyr-restore-") ||
  new URL(origin).hostname !== "localhost"
)
  throw new Error("Only disposable restore targets are supported");
const state = JSON.parse(await readFile(privateFile, "utf8"));
const login = (credentials) =>
  fetch(origin + "/api/auth/login", {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(credentials),
  });
const previous = await login({ email: state.email, password: state.password });
assert.equal(previous.status, 200);
const cookie = previous.headers
  .getSetCookie()
  .map((value) => value.split(";")[0])
  .join("; ");
const core = await containerId(compose(envFile, project), "core");
const output = "/tmp/beta-operator-credential.json";
await docker([
  "exec",
  core,
  "node",
  "/app/scripts/admin-recover.mjs",
  state.email,
  output,
]);
const credentials = JSON.parse(await docker(["exec", core, "cat", output]));
assert.equal(
  (await login({ email: state.email, password: state.password })).status,
  401,
);
assert.equal(
  (await fetch(origin + "/api/users/me/passkeys", { headers: { cookie } }))
    .status,
  401,
);
assert.equal((await login(credentials)).status, 200);
await assert.rejects(
  docker([
    "exec",
    core,
    "node",
    "/app/scripts/admin-recover.mjs",
    state.email,
    output,
  ]),
  /Docker operation failed/,
);
await docker(["exec", core, "rm", output]);
console.log(
  "Operator recovery passed: previous password/session rejected, new private credential works, output overwrite refused.",
);
