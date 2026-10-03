import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { compose, docker, containerId, projectName } from "./docker.mjs";
import { checksum } from "./checksum.mjs";
const [envFile, projectInput, target] = process.argv.slice(2);
if (!envFile || !target) {
  throw new Error(
    "Usage: node scripts/operations/backup.mjs ENV_FILE PROJECT NEW_BACKUP_DIR",
  );
}
const project = projectName(projectInput);
const directory = path.resolve(target);
await mkdir(directory, { recursive: false });
const dc = compose(envFile, project);
const db = await containerId(dc, "db"),
  storage = await containerId(dc, "storage");
try {
  await dc("stop", "ui", "core", "storage");
  await docker([
    "exec",
    db,
    "pg_dump",
    "-U",
    "asmblyr",
    "-d",
    "asmblyr",
    "-Fc",
    "-f",
    "/tmp/asmblyr-backup.dump",
  ]);
  await docker([
    "cp",
    `${db}:/tmp/asmblyr-backup.dump`,
    path.join(directory, "database.dump"),
  ]);
  // Storage is offline while copying its volume, after all API writes are drained.
  await docker([
    "run",
    "--rm",
    "--user",
    "0",
    "--entrypoint",
    "tar",
    "--volumes-from",
    `${storage}:ro`,
    "--mount",
    `type=bind,src=${directory},dst=/backup`,
    "asmblyr-core:local",
    "-czf",
    "/backup/files.tgz",
    "-C",
    "/data",
    ".",
  ]);
  const hashes = {};
  for (const file of ["database.dump", "files.tgz"]) {
    hashes[file] = await checksum(path.join(directory, file));
  }
  const images = {};
  for (const service of ["db", "core", "ui", "storage"]) {
    const id = await containerId(dc, service);
    images[service] = await docker(["inspect", "--format", "{{.Image}}", id]);
  }
  await writeFile(
    path.join(directory, "manifest.json"),
    JSON.stringify(
      {
        format: 1,
        project,
        createdAt: new Date().toISOString(),
        hashes,
        images,
      },
      null,
      2,
    ),
  );
  console.log("Consistent database and object-storage backup completed");
} finally {
  await dc("up", "-d", "--wait", "--no-deps", "storage", "core", "ui");
}
