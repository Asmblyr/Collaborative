import type { Knex } from "knex";
import type { NotificationRecord } from "@asmblyr-collaborative/kit";
import type { Access } from "../permissions/access.js";
import { loadPrincipalAccess } from "../permissions/access.js";
import { createItemsService } from "../plugins/items.js";
import { ItemError } from "../items/validation.js";

export async function notificationTarget(
  db: Knex,
  access: Access,
  target: NotificationRecord,
) {
  if (
    !/^[a-z][a-z0-9_]{0,62}$/.test(target.collection) ||
    /^(asmblyr_|plugin_)/i.test(target.collection) ||
    typeof target.item !== "string" ||
    !target.item ||
    target.item.length > 255
  ) {
    throw new ItemError("Invalid notification target", 400);
  }
  const { data } = await createItemsService(db, access).get(
    target.collection,
    target.item,
    { fields: [] },
  );
  const collection = await db("asmblyr_collections")
    .where({ name: target.collection })
    .first<{ id: string }>("id");
  if (!collection) {
    throw new ItemError("Collection not found", 404);
  }
  return { collection_id: collection.id, item: String(Object.values(data)[0]) };
}

export async function canReadNotification(
  db: Knex,
  access: Access,
  target: NotificationRecord,
): Promise<boolean> {
  try {
    await notificationTarget(db, access, target);
    return true;
  } catch (error) {
    const status = (error as { statusCode?: number }).statusCode;
    if (status === 403 || status === 404) {
      return false;
    }
    throw error;
  }
}

/** Compile the recipient's current row/field rules without impersonating a request. */
export async function recipientAccess(
  db: Knex,
  id: string,
): Promise<Access | null> {
  const user = await db("asmblyr_users").where({ id, status: "active" }).first<{
    id: string;
    email: string;
    superuser: boolean;
  }>("id", "email", "superuser");
  if (!user) {
    return null;
  }
  return loadPrincipalAccess(db, {
    ...user,
    kind: "user",
    sessionId: "notification-delivery",
  });
}
