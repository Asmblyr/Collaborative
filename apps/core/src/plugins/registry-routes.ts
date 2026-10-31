import type { FastifyInstance } from "fastify";
import type { Knex } from "knex";
import { EndpointError } from "@asmblyr-collaborative/kit";
import semver from "semver";
import type { ExtensionEntry } from "@asmblyr-collaborative/contracts";
import {
  requireSettingsRead,
  requireSettingsSection,
} from "../settings/access.js";
import type { LoadedPlugin } from "./definition.js";
import type { RegistryPackage } from "./registry-manifest.js";
import { parseExtensionListQuery } from "./registry-query.js";
import { resolveRegistryPackages } from "./registry-resolver.js";
import {
  extensionHistory,
  extensionStates,
  setExtensionEnabled,
} from "./registry-state.js";

function idFor(name: string): string {
  return Buffer.from(name).toString("base64url");
}

function extensionStatus(
  loaded: boolean,
  desired: boolean,
  issues: string[],
  lastError: string | null,
): ExtensionEntry["status"] {
  if (desired && lastError && !loaded) {
    return "failed";
  }
  if (loaded !== desired) {
    return "restart_required";
  }
  if (!desired) {
    return "disabled";
  }
  if (issues.length) {
    return "incompatible";
  }
  return "healthy";
}

export function registerExtensionRegistryRoutes(
  app: FastifyInstance,
  database: Knex | null,
  packages: readonly RegistryPackage[],
  plugins: readonly LoadedPlugin[],
  coreVersion: string,
  failures: ReadonlyMap<string, string>,
  instanceId: string,
): void {
  function db(): Knex {
    if (!database) {
      throw Object.assign(new Error("Database is not configured"), {
        statusCode: 503,
      });
    }
    return database;
  }
  function find(id: string): RegistryPackage {
    const entry = packages.find((candidate) => idFor(candidate.name) === id);
    if (!entry) {
      throw new EndpointError(
        404,
        "EXTENSION_NOT_FOUND",
        "Расширение не найдено",
      );
    }
    return entry;
  }
  function snapshot(
    entry: RegistryPackage,
    states: Map<string, boolean>,
  ): ExtensionEntry {
    const runtime = plugins.find((plugin) => plugin.name === entry.name);
    const loaded = Boolean(runtime);
    const desired = states.get(entry.name) ?? true;
    const configured = packages.filter(
      (candidate) =>
        candidate.name === entry.name || states.get(candidate.name) !== false,
    );
    const resolution = resolveRegistryPackages(configured, coreVersion);
    const issues = [
      ...(resolution.issues[entry.name] ?? []),
      ...(entry.approvalIssue ? [entry.approvalIssue] : []),
      ...(entry.validationIssue ? [entry.validationIssue] : []),
    ];
    const lastError = failures.get(entry.name) ?? null;
    return {
      id: idFor(entry.name),
      packageName: entry.name,
      namespace: entry.manifest.namespace ?? null,
      title:
        entry.manifest.title ??
        runtime?.translations?.ru?.["settings.title"] ??
        runtime?.settings?.title ??
        entry.manifest.namespace ??
        entry.name,
      description: entry.manifest.description ?? entry.description,
      category: entry.manifest.category ?? null,
      publisher: entry.manifest.publisher ?? null,
      version: entry.version,
      latestAvailableVersion: null,
      manifestVersion: entry.manifest.version,
      status: extensionStatus(loaded, desired, issues, lastError),
      desiredState: desired ? "enabled" : "disabled",
      actualState: loaded ? "enabled" : lastError ? "failed" : "disabled",
      instanceId,
      pendingRestart: loaded !== desired,
      lastError,
      loaded,
      desiredEnabled: desired,
      restartRequired: loaded !== desired,
      compatible: issues.length === 0,
      issues,
      capabilities: entry.manifest.capabilities ?? [],
      dependencies: entry.manifest.dependencies ?? {},
      optionalDependencies: entry.manifest.optionalDependencies ?? {},
      compatibility: entry.manifest.compatibility ?? null,
      actions: {
        enable: !desired && issues.length === 0,
        disable: desired,
        configure: loaded && Boolean(runtime?.settings),
      },
    };
  }
  async function read(request: { headers: { authorization?: string } }) {
    await requireSettingsRead(db(), request, "plugins");
    return extensionStates(db());
  }
  app.get("/settings/extension-registry", async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const states = await read(request);
    const query = parseExtensionListQuery(request.query);
    const entries = packages
      .map((entry) => snapshot(entry, states))
      .filter(
        (entry) =>
          !query.search ||
          `${entry.title} ${entry.packageName} ${entry.description ?? ""}`
            .toLowerCase()
            .includes(query.search.toLowerCase()),
      )
      .filter((entry) => !query.status || entry.status === query.status)
      .filter((entry) => !query.category || entry.category === query.category)
      .sort((left, right) => {
        if (query.sort === "version") {
          return semver.compare(left.version, right.version);
        }
        return left[query.sort].localeCompare(right[query.sort]);
      });
    return {
      data: entries.slice(
        (query.page - 1) * query.limit,
        query.page * query.limit,
      ),
      page: query.page,
      limit: query.limit,
      total: entries.length,
    };
  });
  app.get<{ Params: { id: string } }>(
    "/settings/extension-registry/:id",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const states = await read(request);
      return { data: snapshot(find(request.params.id), states) };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/settings/extension-registry/:id/versions",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      await read(request);
      const entry = find(request.params.id);
      return {
        data: [
          {
            version: entry.version,
            source: "project-package",
            installed: true,
          },
        ],
      };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/settings/extension-registry/:id/dependencies",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      await read(request);
      const entry = find(request.params.id);
      return {
        data: {
          required: entry.manifest.dependencies ?? {},
          optional: entry.manifest.optionalDependencies ?? {},
        },
      };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/settings/extension-registry/:id/permissions",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      await read(request);
      const entry = find(request.params.id);
      return {
        data: {
          declared: entry.manifest.capabilities ?? [],
          approvalIssue: entry.approvalIssue ?? null,
        },
      };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/settings/extension-registry/:id/health",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      const states = await read(request);
      const entry = snapshot(find(request.params.id), states);
      return {
        data: {
          status: entry.status,
          issues: entry.issues,
          restartRequired: entry.restartRequired,
          desiredState: entry.desiredState,
          actualState: entry.actualState,
          pendingRestart: entry.pendingRestart,
          lastError: entry.lastError,
          instanceId: entry.instanceId,
        },
      };
    },
  );
  app.get<{ Params: { id: string } }>(
    "/settings/extension-registry/:id/history",
    async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      await read(request);
      return {
        data: await extensionHistory(db(), find(request.params.id).name),
      };
    },
  );
  function operation(enabled: boolean) {
    return async (
      request: { params: { id: string }; headers: { authorization?: string } },
      reply: { header(name: string, value: string): void },
    ) => {
      reply.header("Cache-Control", "no-store");
      const actor = await requireSettingsSection(db(), request, "plugins");
      const entry = find(request.params.id);
      const changed = await setExtensionEnabled(
        db(),
        packages,
        entry.name,
        enabled,
        actor.id,
        coreVersion,
      );
      if (changed) {
        app.log.info({
          event: enabled
            ? "extension.enable.requested"
            : "extension.disable.requested",
          packageName: entry.name,
          actorId: actor.id,
          instanceId,
        });
      }
      const states = await extensionStates(db());
      return { data: { ...snapshot(entry, states), changed } };
    };
  }
  app.post<{ Params: { id: string } }>(
    "/settings/extension-registry/:id/enable",
    operation(true),
  );
  app.post<{ Params: { id: string } }>(
    "/settings/extension-registry/:id/disable",
    operation(false),
  );
}
