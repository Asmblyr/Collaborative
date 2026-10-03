import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export function projectName(value) {
  if (!/^asmblyr-(?:beta|restore)(?:-[a-z0-9-]{1,40})?$/.test(value ?? "")) {
    throw new Error("Use a dedicated asmblyr-beta or asmblyr-restore project");
  }
  return value;
}
export async function docker(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("docker", args, {
      cwd: root,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "",
      errors = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      errors += chunk;
    });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve(output.trim());
      } else {
        reject(
          new Error(
            `Docker operation failed (${code}): ${errors.slice(-1200)}`,
          ),
        );
      }
    });
  });
}
export function compose(envFile, project) {
  const prefix = [
    "compose",
    "--env-file",
    path.resolve(envFile),
    "-p",
    projectName(project),
    "-f",
    path.join(root, "infra/beta/compose.yaml"),
  ];
  return (...args) => docker([...prefix, ...args]);
}
export async function containerId(dc, service) {
  const id = await dc("ps", "-aq", service);
  if (!/^[a-f0-9]{12,64}$/.test(id)) {
    throw new Error(`Missing single ${service} container`);
  }
  return id;
}
