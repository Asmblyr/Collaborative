import { readFileSync } from "node:fs";
import semver from "semver";

const metadata = JSON.parse(
  readFileSync(new URL("../package.json", import.meta.url), "utf8"),
);

export function resolveCoreVersion(
  packageVersion: string,
  releaseVersion?: string,
): string {
  const version = releaseVersion || packageVersion;
  const parsed = semver.parse(version);
  const build = parsed?.build.length ? `+${parsed.build.join(".")}` : "";
  const canonical = parsed ? `${parsed.version}${build}` : undefined;
  if (!parsed || parsed.version === "0.0.0" || canonical !== version) {
    throw new Error(
      "ASMBLYR_CORE_VERSION must be a non-placeholder semantic version",
    );
  }
  return version;
}

/** The host project's package version does not describe the installed Core. */
export const CORE_VERSION = resolveCoreVersion(
  metadata.version,
  process.env.ASMBLYR_CORE_VERSION,
);
