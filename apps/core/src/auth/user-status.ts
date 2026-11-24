import type { Knex } from "knex";
import { AccessDeniedError } from "../permissions/access.js";
import { requireManagedInvitation } from "../policies/delegation-access.js";
import { securityEvent } from "./security-events.js";
import { AuthConflictError, UserNotFoundError } from "./validation.js";

export type UserStatus = "active" | "disabled";

export interface UserStatusActor {
  id: string;
  superuser: boolean;
}

export interface UserStatusResult {
  id: string;
  email: string;
  status: UserStatus;
  superuser: boolean;
}

export async function setUserStatus(
  database: Knex,
  actor: UserStatusActor,
  targetId: string,
  status: UserStatus,
): Promise<UserStatusResult> {
  if (actor.id === targetId) {
    throw new AuthConflictError("Cannot change your own account status");
  }

  return database.transaction(async (trx) => {
    const target = await trx("public.asmblyr_users")
      .where({ id: targetId })
      .forUpdate()
      .first<UserStatusResult>("id", "email", "status", "superuser");
    if (!target) {
      throw new UserNotFoundError();
    }

    if (!actor.superuser) {
      if (target.superuser) {
        throw new AccessDeniedError();
      }
      await requireManagedInvitation(trx, actor.id, targetId);
    }

    if (target.superuser && status === "disabled") {
      await trx.raw("SELECT pg_advisory_xact_lock(691241, 2)");
      const activeSuperusers = await trx("public.asmblyr_users")
        .where({ superuser: true, status: "active" })
        .forUpdate()
        .select<{ id: string }[]>("id");
      if (activeSuperusers.length <= 1) {
        throw new AuthConflictError("Cannot disable the last active superuser");
      }
    }

    if (status === "active" && target.status !== "disabled") {
      const pendingInvitation = await trx("public.asmblyr_user_invitations")
        .where({ user_id: targetId })
        .whereNull("consumed_at")
        .first("user_id");
      if (pendingInvitation) {
        throw new AuthConflictError(
          "Invited user must accept the invitation to activate",
        );
      }
    }

    const [updated] = await trx("public.asmblyr_users")
      .where({ id: targetId })
      .update({ status, updated_at: trx.fn.now() })
      .returning<UserStatusResult[]>(["id", "email", "status", "superuser"]);

    let revokedSessionCount = 0;
    if (status === "disabled") {
      const revoked = await trx("public.asmblyr_auth_sessions")
        .where({ user_id: targetId })
        .whereNull("revoked_at")
        .update({ revoked_at: trx.fn.now() })
        .returning<{ id: string }[]>("id");
      revokedSessionCount = revoked.length;
    }

    await securityEvent(
      trx,
      actor.id,
      status === "disabled" ? "user.disabled" : "user.enabled",
      targetId,
      status === "disabled" ? { revokedSessionCount } : {},
    );

    return updated;
  });
}
