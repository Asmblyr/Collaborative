import type { Knex } from "knex";
import { EndpointError } from "@asmblyr-collaborative/kit";
import type { RegistryPackage } from "./registry-manifest.js";
import { resolveRegistryPackages } from "./registry-resolver.js";

interface StateRow {
  package_name: string;
  enabled: boolean;
}

export interface HistoryRow {
  id: string;
  package_name: string;
  action: string;
  result: string;
  error_code: string | null;
  error_message: string | null;
  actor_id: string | null;
  instance_id: string | null;
  created_at: string;
}

export async function extensionStates(
  database: Knex,
): Promise<Map<string, boolean>> {
  const rows = await database<StateRow>("asmblyr_extension_states")
    .withSchema("public")
    .select("package_name", "enabled");
  return new Map(rows.map((row) => [row.package_name, row.enabled]));
}

export async function disabledExtensionPackages(
  database: Knex,
): Promise<string[]> {
  const states = await extensionStates(database);
  return [...states].filter(([, enabled]) => !enabled).map(([name]) => name);
}

export async function extensionHistory(
  database: Knex,
  name: string,
  limit = 50,
): Promise<HistoryRow[]> {
  return database<HistoryRow>("asmblyr_extension_history")
    .withSchema("public")
    .where({ package_name: name })
    .orderBy("id", "desc")
    .limit(limit)
    .select(
      "id",
      "package_name",
      "action",
      "result",
      "error_code",
      "error_message",
      "actor_id",
      "instance_id",
      "created_at",
    );
}

/** Audit startup outcomes without treating one process as cluster-wide state. */
export async function recordExtensionStartup(
  database: Knex,
  packages: readonly RegistryPackage[],
  loadedNames: ReadonlySet<string>,
  failures: ReadonlyMap<string, string>,
  instanceId: string,
): Promise<void> {
  const rows = packages
    .filter((entry) => loadedNames.has(entry.name) || failures.has(entry.name))
    .map((entry) => {
      const error = failures.get(entry.name);
      const validation = Boolean(entry.validationIssue || entry.approvalIssue);
      let errorCode: string | null = null;
      if (error) {
        errorCode = validation
          ? "EXTENSION_VALIDATION_FAILED"
          : "EXTENSION_STARTUP_FAILED";
      }
      return {
        package_name: entry.name,
        action: validation ? "validation" : "startup",
        result: loadedNames.has(entry.name) ? "succeeded" : "failed",
        error_code: errorCode,
        error_message: error ?? null,
        actor_id: null,
        instance_id: instanceId,
      };
    });
  if (rows.length) {
    await database("asmblyr_extension_history")
      .withSchema("public")
      .insert(rows);
  }
}

/** A global transaction lock protects the desired dependency graph across workers. */
export async function setExtensionEnabled(
  database: Knex,
  packages: readonly RegistryPackage[],
  name: string,
  enabled: boolean,
  actorId: string,
  coreVersion: string,
): Promise<boolean> {
  if (!packages.some((entry) => entry.name === name)) {
    throw new EndpointError(
      404,
      "EXTENSION_NOT_FOUND",
      "Расширение не найдено",
    );
  }
  const selected = packages.find((entry) => entry.name === name)!;
  try {
    if (enabled && selected.approvalIssue) {
      throw new EndpointError(
        409,
        "EXTENSION_PERMISSION_REVIEW_REQUIRED",
        selected.approvalIssue,
      );
    }
    if (enabled && selected.validationIssue) {
      throw new EndpointError(
        409,
        "EXTENSION_MANIFEST_INVALID",
        selected.validationIssue,
      );
    }
    return await database.transaction(async (transaction) => {
      await transaction.raw(
        "SELECT pg_advisory_xact_lock(hashtextextended(?::text, 0))",
        ["asmblyr:extension-registry"],
      );
      const states = await extensionStates(transaction);
      const current = states.get(name) ?? true;
      if (current === enabled) {
        return false;
      }
      const before = packages.filter(
        (entry) => states.get(entry.name) !== false,
      );
      const baseline = resolveRegistryPackages(before, coreVersion);
      states.set(name, enabled);
      const desired = packages.filter(
        (entry) => states.get(entry.name) !== false,
      );
      const resolution = resolveRegistryPackages(desired, coreVersion);
      const problems = Object.entries(resolution.issues)
        .map(
          ([packageName, messages]) =>
            [
              packageName,
              messages.filter(
                (message) => !baseline.issues[packageName]?.includes(message),
              ),
            ] as const,
        )
        .filter(([, messages]) => messages.length);
      if (problems.length) {
        throw new EndpointError(
          409,
          "EXTENSION_DEPENDENCY_CONFLICT",
          problems
            .map(
              ([packageName, messages]) =>
                `${packageName}: ${messages.join("; ")}`,
            )
            .join(" | "),
        );
      }
      await transaction("asmblyr_extension_states")
        .withSchema("public")
        .insert({ package_name: name, enabled })
        .onConflict("package_name")
        .merge({ enabled, updated_at: transaction.fn.now() });
      await transaction("asmblyr_extension_history")
        .withSchema("public")
        .insert({
          package_name: name,
          action: enabled ? "enable" : "disable",
          result: "restart_required",
          actor_id: actorId,
        });
      return true;
    });
  } catch (error) {
    if (error instanceof EndpointError && error.statusCode === 409) {
      await database("asmblyr_extension_history")
        .withSchema("public")
        .insert({
          package_name: name,
          action: enabled ? "enable" : "disable",
          result: "blocked",
          error_code: error.code,
          error_message: error.message,
          actor_id: actorId,
        });
    }
    throw error;
  }
}
