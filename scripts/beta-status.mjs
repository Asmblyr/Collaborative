import { compose, containerId, docker } from "./beta/docker.mjs";
const [envFile, project] = process.argv.slice(2);
if (!envFile || !project) {
  throw new Error("Usage: node scripts/beta-status.mjs ENV_FILE PROJECT");
}
const dc = compose(envFile, project);
for (const service of ["db", "storage", "core", "ui"]) {
  const id = await containerId(dc, service);
  const status = JSON.parse(
    await docker(["inspect", "--format", "{{json .State}}", id]),
  );
  if (
    !status.Running ||
    (status.Health && status.Health.Status !== "healthy")
  ) {
    throw new Error(`${service} is not ready`);
  }
  console.log(`${service}: ready`);
}
await dc(
  "exec",
  "-T",
  "core",
  "node",
  "-e",
  "fetch('http://127.0.0.1:3001/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))",
);
