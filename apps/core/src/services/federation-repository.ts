import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import { securityEvent } from "../auth/security-events.js";
import { AuthInputError } from "../auth/validation.js";
import { requireAccount } from "./account-lookup.js";
import { objectInput, textInput } from "../shared/input.js";
import { requireManagedService } from "../policies/delegation-access.js";

const table = "asmblyr_service_federations";
const columns = [
  "id",
  "name",
  "project_id as projectId",
  "project_path as projectPath",
  "ref",
  "audience",
  "created_at as createdAt",
  "last_used_at as lastUsedAt",
  "revoked_at as revokedAt",
];

export function listFederations(db: Knex, serviceId: string) {
  return db(table)
    .withSchema("public")
    .where({ service_id: serviceId })
    .select(columns)
    .orderBy("created_at", "desc");
}

export async function createFederation(
  db: Knex,
  serviceId: string,
  value: unknown,
  actor: string,
) {
  const input = objectInput(value, ["name", "projectId", "projectPath", "ref"]);
  const name = textInput(input.name, 120),
    projectId = textInput(input.projectId, 30);
  const projectPath = textInput(input.projectPath, 255),
    ref = textInput(input.ref, 255);
  if (
    !/^[1-9][0-9]*$/.test(projectId) ||
    !/^[\w.-]+(?:\/[\w.-]+)+$/.test(projectPath) ||
    /[:*?\[\]\\\s]/.test(ref)
  ) {
    throw new AuthInputError("Invalid GitLab project or branch");
  }
  return db.transaction(async (trx) => {
    const account = await requireAccount(trx, serviceId, true);
    await requireManagedService(trx, actor, serviceId);
    if (account.status !== "active") {
      throw new AuthInputError("Service account is disabled");
    }
    const [{ count }] = await trx(table)
      .where({ service_id: serviceId, revoked_at: null })
      .count<{ count: string }[]>("*");
    if (Number(count) >= 20) {
      throw new AuthInputError(
        "Maximum 20 active federations per service account",
      );
    }
    const [binding] = await trx(table)
      .withSchema("public")
      .insert({
        service_id: serviceId,
        name,
        project_id: projectId,
        project_path: projectPath,
        ref,
        audience: `urn:asmblyr:gitlab:${randomUUID()}`,
      })
      .returning(columns);
    await securityEvent(trx, actor, "service.federation_created", serviceId, {
      federationId: binding.id,
      projectId,
      projectPath,
      ref,
    });
    return binding;
  });
}

export async function revokeFederation(
  db: Knex,
  serviceId: string,
  id: string,
  actor: string,
) {
  await db.transaction(async (trx) => {
    await requireAccount(trx, serviceId, true);
    await requireManagedService(trx, actor, serviceId);
    const binding = await trx(table)
      .where({ id, service_id: serviceId })
      .first();
    if (!binding) {
      throw Object.assign(new Error("Federation not found"), {
        statusCode: 404,
      });
    }
    if (binding.revoked_at) {
      return;
    }
    await trx(table).where({ id }).update({ revoked_at: trx.fn.now() });
    await trx("asmblyr_service_tokens").where({ federation_id: id }).delete();
    await securityEvent(trx, actor, "service.federation_revoked", serviceId, {
      federationId: id,
    });
  });
}
