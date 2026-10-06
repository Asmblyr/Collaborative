import {
  EndpointError,
  type RecordNotifications,
  type RecordNotificationInput,
} from "@asmblyr-collaborative/kit";
import type { Knex } from "knex";
import { requireHuman, type Access } from "../permissions/access.js";
import type { LoadedPlugin } from "../plugins/definition.js";
import { pluginActor } from "../plugins/actor.js";
import {
  notificationTarget,
  recipientAccess,
  canReadNotification,
} from "./access.js";
import { inboxTable, subscriptionsTable, trimInbox } from "./repository.js";

function validateEvent(input: RecordNotificationInput): void {
  if (
    !/^[a-zA-Z0-9_-]{1,128}$/.test(input.eventId) ||
    !/^[a-z][a-z0-9-]{0,63}$/.test(input.panelId) ||
    typeof input.targetId !== "string" ||
    !input.targetId ||
    input.targetId.length > 128 ||
    typeof input.preview !== "string" ||
    !input.preview.trim() ||
    input.preview.length > 300
  ) {
    throw new EndpointError(
      400,
      "INVALID_NOTIFICATION",
      "Invalid notification event",
    );
  }
}

/** Core binds the source, author and recipients; plugins cannot supply users or URLs. */
export function pluginNotifications(
  db: Knex,
  access: Access,
  plugin: LoadedPlugin,
): RecordNotifications | undefined {
  if (!plugin.capabilities?.includes("notifications")) {
    return undefined;
  }
  const source = plugin.namespace;
  if (!source) {
    throw new Error("Notifications require a plugin namespace");
  }
  const notifications: RecordNotifications = {
    async following(target) {
      requireHuman(access);
      const canonical = await notificationTarget(db, access, target);
      const row = await db(subscriptionsTable)
        .where({ ...canonical, source, user_id: access.principal.id })
        .first<{ enabled: boolean }>("enabled");
      return row?.enabled ?? false;
    },
    async follow(target, enabled) {
      requireHuman(access);
      if (typeof enabled !== "boolean") {
        throw new EndpointError(
          400,
          "INVALID_SUBSCRIPTION",
          "Expected boolean enabled",
        );
      }
      const canonical = await notificationTarget(db, access, target);
      await db(subscriptionsTable)
        .insert({ ...canonical, source, user_id: access.principal.id, enabled })
        .onConflict(["user_id", "source", "collection_id", "item"])
        .merge({ enabled });
    },
    async publish(input) {
      validateEvent(input);
      // Nesting in withRecord uses a savepoint, keeping comment and inbox writes atomic.
      await db.transaction(async (transaction) => {
        const target = await notificationTarget(transaction, access, input);
        if (access.principal.kind === "user") {
          await transaction(subscriptionsTable)
            .insert({
              ...target,
              source,
              user_id: access.principal.id,
              enabled: true,
            })
            .onConflict(["user_id", "source", "collection_id", "item"])
            .ignore();
        }
        const recipients = await transaction(subscriptionsTable)
          .where({ ...target, source, enabled: true })
          .whereNot("user_id", access.principal.id)
          .orderBy("user_id")
          .pluck<string[]>("user_id");
        const actor = await pluginActor(transaction, access.principal);
        for (const userId of recipients) {
          // Serialize deliveries per inbox, including retention and duplicate events.
          await transaction("asmblyr_users")
            .where({ id: userId })
            .forNoKeyUpdate()
            .first("id");
          const recipient = await recipientAccess(transaction, userId);
          if (
            !recipient ||
            !(await canReadNotification(transaction, recipient, input))
          ) {
            continue;
          }
          await transaction(inboxTable)
            .insert({
              ...target,
              user_id: userId,
              source,
              event_id: input.eventId,
              panel_id: input.panelId,
              target_id: input.targetId,
              preview: input.preview.trim(),
              actor_name: actor.displayName?.slice(0, 128) ?? null,
            })
            .onConflict(["user_id", "source", "event_id"])
            .ignore();
          await trimInbox(transaction, userId);
        }
      });
    },
    async remove(eventId) {
      // Source-bound cleanup only, never cross-plugin inbox access.
      await db(inboxTable).where({ source, event_id: eventId }).delete();
    },
    async update(eventId, preview) {
      if (
        typeof preview !== "string" ||
        !preview.trim() ||
        preview.length > 300
      ) {
        throw new EndpointError(
          400,
          "INVALID_NOTIFICATION",
          "Invalid notification preview",
        );
      }
      await db(inboxTable)
        .where({ source, event_id: eventId })
        .update({ preview: preview.trim() });
    },
  };
  return Object.freeze(notifications);
}
