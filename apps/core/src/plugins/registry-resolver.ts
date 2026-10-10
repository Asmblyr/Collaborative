import semver from "semver";
import type { RegistryPackage } from "./registry-manifest.js";

export interface Resolution {
  order: string[];
  issues: Record<string, string[]>;
}

/** Required dependencies must be configured, version compatible and acyclic. */
export function resolveRegistryPackages(
  packages: readonly RegistryPackage[],
  coreVersion: string,
  nodeVersion = process.version,
): Resolution {
  const byName = new Map(packages.map((entry) => [entry.name, entry]));
  const issues: Record<string, string[]> = {};
  const order: string[] = [];
  const visiting = new Set<string>();
  const visited = new Set<string>();

  function issue(name: string, message: string) {
    (issues[name] ??= []).push(message);
  }

  const namespaces = new Map<string, string>();
  for (const entry of packages) {
    const namespace = entry.manifest.namespace;
    if (!namespace) {
      continue;
    }
    const owner = namespaces.get(namespace);
    if (owner) {
      issue(entry.name, `Namespace ${namespace} is already used by ${owner}`);
      issue(owner, `Namespace ${namespace} is also used by ${entry.name}`);
    } else {
      namespaces.set(namespace, entry.name);
    }
  }

  function visit(name: string, path: string[]) {
    if (visited.has(name)) {
      return;
    }
    if (visiting.has(name)) {
      issue(name, `Dependency cycle: ${[...path, name].join(" -> ")}`);
      return;
    }
    const entry = byName.get(name);
    if (!entry) {
      return;
    }
    visiting.add(name);

    const compatibility = entry.manifest.compatibility;
    if (
      compatibility &&
      !semver.satisfies(coreVersion, compatibility.collaborative)
    ) {
      issue(
        name,
        `Requires Collaborative ${compatibility.collaborative}; current ${coreVersion}`,
      );
    }
    if (
      compatibility?.node &&
      !semver.satisfies(nodeVersion, compatibility.node)
    ) {
      issue(
        name,
        `Requires Node ${compatibility.node}; current ${nodeVersion}`,
      );
    }
    for (const [dependency, range] of Object.entries(
      entry.manifest.dependencies ?? {},
    )) {
      const installed = byName.get(dependency);
      if (!installed) {
        issue(name, `Missing required dependency ${dependency} ${range}`);
        continue;
      }
      if (!semver.satisfies(installed.version, range)) {
        issue(
          name,
          `Dependency ${dependency} requires ${range}; configured ${installed.version}`,
        );
      }
      if (visiting.has(dependency)) {
        issue(
          name,
          `Dependency cycle: ${[...path, name, dependency].join(" -> ")}`,
        );
        continue;
      }
      visit(dependency, [...path, name]);
      for (const inherited of issues[dependency] ?? []) {
        issue(name, `Dependency ${dependency}: ${inherited}`);
      }
    }
    visiting.delete(name);
    visited.add(name);
    order.push(name);
  }

  for (const entry of packages) {
    visit(entry.name, []);
  }
  return { order, issues };
}
