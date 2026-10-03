import { execFileSync } from "node:child_process";
import { lstat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = execFileSync(
  "git",
  ["ls-files", "--cached", "--others", "--exclude-standard", "-z"],
  { cwd: root, encoding: "utf8", windowsHide: true },
)
  .split("\0")
  .filter(Boolean);

const privateDirectory =
  /^(?:infra|plugins|work|outputs|artifacts|backups|secrets|\.local-data|\.tmp|\.pnpm-store)\//;
const internalDocs =
  /^docs\/(?:design|research|reviews|ideas|public\/history)\//;
const privateFile = /\.(?:pem|key|p12|pfx|keystore|dump|backup|bak|log)$/i;
const violations = [];
for (const file of new Set(files)) {
  // Deleted files still appear in the index before a local cleanup is staged.
  try {
    await lstat(path.join(root, file));
  } catch (error) {
    if (error.code === "ENOENT") {
      continue;
    }
    throw error;
  }
  const environment = /(?:^|\/)(?:\.env(?:\..*)?|.*\.env(?:\..*)?)$/.test(file);
  const example =
    /(?:^|\/)\.env(?:\..*)?\.example$|\.env(?:\..*)?\.example$/.test(file);
  if (
    privateDirectory.test(file) ||
    internalDocs.test(file) ||
    privateFile.test(file) ||
    (environment && !example) ||
    /^docs\/security\/.*-20\d\d-\d\d-\d\d\.md$/.test(file) ||
    file === "docs/archive.md" ||
    file === "design-qa.md" ||
    file === ".gitlab-ci.yml"
  ) {
    violations.push(file);
  }
}
if (violations.length) {
  throw new Error(
    `Private material in publication candidates:\n${violations.join("\n")}`,
  );
}
console.log(
  "Publication paths checked. Review file contents separately for secrets.",
);
