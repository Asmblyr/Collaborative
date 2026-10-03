import { readFile } from "node:fs/promises";
import path from "node:path";
import { compose, docker, containerId, projectName } from "./beta/docker.mjs";
import { checksum } from "./beta/checksum.mjs";
const [envFile, projectInput, source] = process.argv.slice(2);
if (!envFile || !source) {
  throw new Error(
    "Usage: node scripts/beta-restore.mjs ENV_FILE NEW_RESTORE_PROJECT BACKUP_DIR",
  );
}
const project = projectName(projectInput);
if (!project.startsWith("asmblyr-restore-")) {
  throw new Error("Restore requires a fresh asmblyr-restore-NAME project");
}
const directory = path.resolve(source);
const manifest = JSON.parse(
  await readFile(path.join(directory, "manifest.json"), "utf8"),
);
if (manifest.format !== 1 || project === manifest.project) {
  throw new Error("Invalid restore manifest or target");
}
for (const file of ["database.dump", "files.tgz"]) {
  const hash = await checksum(path.join(directory, file));
  if (manifest.hashes[file] !== hash) {
    throw new Error("Backup checksum mismatch");
  }
}
for (const [service, tag] of Object.entries({
  db: "postgres:17-alpine",
  core: "asmblyr-core:beta-local",
  ui: "asmblyr-ui:beta-local",
  storage: "asmblyr-beta-storage:local",
})) {
  const actual = await docker(["image", "inspect", "--format", "{{.Id}}", tag]);
  if (manifest.images[service] !== actual)
    throw new Error(`Restore requires the backed-up ${service} image`);
}
for (const volume of ["postgres_data", "files_data"]) {
  const existing = await docker([
    "volume",
    "ls",
    "--filter",
    `name=^${project}_${volume}$`,
    "--format",
    "{{.Name}}",
  ]);
  if (existing) {
    throw new Error("Refusing to overwrite an existing restore volume");
  }
}
const dc = compose(envFile, project);
await dc("up", "-d", "--wait", "db", "storage");
const db = await containerId(dc, "db"),
  storage = await containerId(dc, "storage");
await dc("stop", "storage");
await docker([
  "cp",
  path.join(directory, "database.dump"),
  `${db}:/tmp/asmblyr-restore.dump`,
]);
await docker([
  "exec",
  db,
  "pg_restore",
  "-U",
  "asmblyr",
  "-d",
  "asmblyr",
  "--exit-on-error",
  "--no-owner",
  "/tmp/asmblyr-restore.dump",
]);
await docker([
  "run",
  "--rm",
  "--user",
  "0",
  "--entrypoint",
  "tar",
  "--volumes-from",
  storage,
  "--mount",
  `type=bind,src=${directory},dst=/backup,readonly`,
  "asmblyr-core:beta-local",
  "-xzf",
  "/backup/files.tgz",
  "-C",
  "/data",
]);
await dc("up", "-d", "--wait", "core", "ui");
console.log(
  "Restored into a fresh project; database and object storage are running",
);
