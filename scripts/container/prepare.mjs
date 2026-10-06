import { cp, mkdir, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

// Preserve pnpm's relative links; include only the Core/plugin workspace packages.
// Dependency installation and pruning are performed by pnpm with the frozen lockfile.
const source = process.cwd();
const target = path.resolve(process.argv[2]);
if (target === source || target.startsWith(source + path.sep)) {
  throw new Error("Runtime output must be outside the source workspace");
}
await mkdir(target, { recursive: false });
async function copy(relative, optional = false) {
  try {
    await stat(path.join(source, relative));
  } catch (error) {
    if (optional && error.code === "ENOENT") {
      return;
    }
    throw error;
  }
  await cp(path.join(source, relative), path.join(target, relative), {
    recursive: true,
    verbatimSymlinks: true,
  });
}
async function metadata(directory) {
  return {
    directory,
    manifest: JSON.parse(
      await readFile(path.join(directory, "package.json"), "utf8"),
    ),
  };
}
const packages = new Map();
for (const directory of await readdir("packages")) {
  const entry = await metadata(`packages/${directory}`);
  packages.set(entry.manifest.name, entry);
}
const pending = [await metadata("."), await metadata("apps/core")];
const copied = new Set();
while (pending.length) {
  const { directory, manifest } = pending.shift();
  if (copied.has(manifest.name)) {
    continue;
  }
  copied.add(manifest.name);
  if (!Array.isArray(manifest.files)) {
    throw new Error(
      `Runtime package ${manifest.name} needs an explicit files list`,
    );
  }
  await copy(path.join(directory, "package.json"));
  await copy(path.join(directory, "node_modules"), true);
  await copy(path.join(directory, "LICENSE"), true);
  for (const file of manifest.files) {
    await copy(path.join(directory, file), true);
  }
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    if (!version.startsWith("workspace:")) {
      continue;
    }
    const alias = version.slice("workspace:".length);
    const packageName = alias.startsWith("@")
      ? alias.slice(0, alias.lastIndexOf("@"))
      : name;
    const dependency = packages.get(packageName);
    if (!dependency) {
      throw new Error(`Missing local package ${packageName}`);
    }
    pending.push(dependency);
  }
}
console.log(`Runtime workspace packages: ${[...copied].join(", ")}`);
