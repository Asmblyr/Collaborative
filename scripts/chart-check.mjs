import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
const chart = "deploy/helm/collaborative";
const values = [
  "--set",
  "image.tag=verify",
  "--set",
  "publicUrl=https://admin.example.test",
  "--set",
  "existingSecret=private-core",
  "--set",
  "core.replicas=2",
  "--set",
  "ui.replicas=2",
  "--set",
  "ingress.tlsSecretName=admin-tls",
  "--set",
  "coreSecretFiles[0].name=oauth",
  "--set",
  "coreSecretFiles[0].secretName=private-oauth",
];
const helm = (...args) =>
  execFileSync("helm", args, {
    encoding: "utf8",
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
console.log(helm("lint", chart, ...values));
const yaml = helm("template", "verify", chart, ...values);
const documents = yaml.split(/^---$/m);
const deployments = documents.filter((entry) => /kind: Deployment/.test(entry));
assert.equal(deployments.length, 2);
const ui = deployments.find((entry) =>
  /name: verify-collaborative-ui/.test(entry),
);
assert.ok(ui);
assert.doesNotMatch(
  ui,
  /private-core|private-oauth|secret-oauth|DATABASE_URL|SECRETS_LOCAL_KEY|ASMBLYR_SETUP_TOKEN|envFrom/,
);
const core = deployments.find((entry) =>
  /name: verify-collaborative-core/.test(entry),
);
const migration = documents.find((entry) => /kind: Job/.test(entry));
for (const document of [core, migration]) {
  assert.match(document, /mountPath: \/run\/secrets\/oauth/);
  assert.match(document, /secretName: "private-oauth"/);
  assert.match(document, /readOnly: true/);
}
for (const deployment of deployments) {
  assert.match(deployment, /replicas: 2/);
  assert.match(deployment, /automountServiceAccountToken: false/);
  assert.match(deployment, /readOnlyRootFilesystem: true/);
}
const ingress = documents.find((entry) => /kind: Ingress/.test(entry));
assert.match(ingress, /host: "admin.example.test"/);
for (const path of [
  "/api",
  "/oauth",
  "/sign/sso",
  "/connections/google/callback",
]) {
  // Inspect the backend before the next path rather than just checking that a path exists.
  const route = ingress.split(`- path: ${path}\n`)[1]?.split("- path:")[0];
  assert.match(route ?? "", /name: verify-collaborative-core/);
}
assert.match(
  ingress.split("- path: /oauth/interaction\n")[1]?.split("- path:")[0] ?? "",
  /name: verify-collaborative-ui/,
);
assert.match(yaml, /helm.sh\/hook: pre-install,pre-upgrade/);
assert.throws(() =>
  helm("template", "invalid", chart, ...values, "--set", "core.replicas=0"),
);
assert.throws(() =>
  helm(
    "template",
    "invalid",
    chart,
    ...values,
    "--set",
    "coreEnv.PUBLIC_PORT=3000",
  ),
);
console.log(
  "Chart routing, replicas, probes, secret isolation and invalid values: passed",
);
