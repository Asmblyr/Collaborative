import type { Knex } from "knex";
import type { UserProfileExtensionResult } from "@asmblyr-collaborative/contracts";
import {
  grantFor,
  requireGrant,
  type Access,
  AccessDeniedError,
} from "../permissions/access.js";
import { getItem, createItem } from "../items/service.js";
import { updateAuthorizedItem } from "../items/writer.js";
import { requireRelatedRead } from "../items/related.js";
import { mutationContext } from "../items/mutation-context.js";
import type { MutationContext } from "../items/events-repository.js";
import { profileExtensionBinding } from "./profile-extension-config.js";
import { UserNotFoundError, AuthInputError } from "./validation.js";
import { objectInput } from "../shared/input.js";

export async function readProfileExtension(
  db: Knex,
  access: Access,
  userId: string,
): Promise<UserProfileExtensionResult> {
  const binding = await profileExtensionBinding(db);
  if (!binding || !grantFor(access, binding.collection, "read")) {
    return { data: null };
  }
  const allowed = requireGrant(access, binding.collection, "read");
  try {
    const data = await getItem(
      db,
      binding.collection,
      userId,
      allowed,
      undefined,
      access,
    );
    return {
      data: { collection: binding.collection, userId, exists: true, data },
    };
  } catch (error) {
    if (
      !(
        error instanceof Error &&
        "statusCode" in error &&
        error.statusCode === 404
      )
    ) {
      throw error;
    }
    // Never treat a hidden existing row as a new row or disclose its existence.
    return {
      data: {
        collection: binding.collection,
        userId,
        exists: false,
        data: null,
      },
    };
  }
}

export async function saveProfileExtension(
  db: Knex,
  access: Access,
  userId: string,
  input: unknown,
  mutation: MutationContext = mutationContext(access),
): Promise<UserProfileExtensionResult> {
  return db.transaction(async (trx) => {
    const binding = await profileExtensionBinding(trx, true);
    if (!binding) {
      throw new AuthInputError("Profile extension is not configured");
    }
    const body = objectInput(input, ["collection", "values"]);
    if (body.collection !== binding.collection) {
      throw new AuthInputError(
        "Profile extension collection has changed; reload its schema",
      );
    }
    const values = body.values;
    const allowedRead = requireGrant(access, binding.collection, "read");
    const user = await trx("public.asmblyr_users")
      .where({ id: userId })
      .forUpdate()
      .first("id");
    if (!user) {
      throw new UserNotFoundError();
    }
    const existing = await trx(binding.collection)
      .withSchema("public")
      .where(binding.key, userId)
      .first(binding.key);
    if (existing) {
      await getItem(
        trx,
        binding.collection,
        userId,
        allowedRead,
        undefined,
        access,
      );
      const result = await updateAuthorizedItem(
        trx,
        access,
        binding.collection,
        userId,
        values,
        mutation,
      );
      return {
        data: {
          collection: binding.collection,
          userId,
          exists: true,
          data: result.data,
        },
      };
    }
    const allowed = requireGrant(access, binding.collection, "create");
    await requireRelatedRead(trx, binding.collection, values, access);
    await createItem(
      trx,
      binding.collection,
      values,
      { ...mutation, access },
      allowed,
      userId,
    );
    // A create rule cannot return or persist a row the caller is not allowed to read.
    try {
      const data = await getItem(
        trx,
        binding.collection,
        userId,
        allowedRead,
        undefined,
        access,
      );
      return {
        data: { collection: binding.collection, userId, exists: true, data },
      };
    } catch (error) {
      if (
        error instanceof Error &&
        "statusCode" in error &&
        error.statusCode === 404
      ) {
        throw new AccessDeniedError();
      }
      throw error;
    }
  });
}
