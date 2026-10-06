import type { Knex } from "knex";
import type { NotificationResult } from "@asmblyr-collaborative/contracts";
import type { Access } from "../permissions/access.js";
import { requireHuman } from "../permissions/access.js";
import { ItemError } from "../items/validation.js";
import { canReadNotification } from "./access.js";
import { inboxRows, inboxTable, type InboxRow } from "./repository.js";

export class NotificationsService {
  constructor(
    private readonly db: Knex,
    private readonly access: Access,
    private readonly sources: ReadonlySet<string>,
  ) {
    requireHuman(access);
  }

  async list(limit: number): Promise<NotificationResult> {
    const clock = await this.db
      .select({ now: this.db.fn.now() })
      .first<{ now: Date }>();
    const rows = await inboxRows(this.db, this.access.principal.id);
    const visible: InboxRow[] = [];
    const permissions = new Map<string, boolean>();
    for (const row of rows) {
      if (!this.sources.has(row.source)) {
        continue;
      }
      const key = JSON.stringify([row.collection, row.item]);
      let allowed = permissions.get(key);
      if (allowed === undefined) {
        allowed = await canReadNotification(this.db, this.access, {
          collection: row.collection,
          item: row.item,
        });
        permissions.set(key, allowed);
      }
      if (allowed) {
        visible.push(row);
      }
    }
    return {
      unread: visible.filter((row) => !row.read_at).length,
      total: visible.length,
      readBefore: clock!.now.toISOString(),
      data: visible.slice(0, limit).map((row) => ({
        id: row.id,
        source: row.source,
        panelId: row.panel_id,
        targetId: row.target_id,
        collection: row.collection,
        collectionDisplayName: row.collection_display_name,
        item: row.item,
        actorName: row.actor_name,
        preview: row.preview,
        createdAt: row.created_at.toISOString(),
        readAt: row.read_at?.toISOString() ?? null,
      })),
    };
  }

  async read(id: string): Promise<void> {
    const rows = await inboxRows(this.db, this.access.principal.id).where(
      "n.id",
      id,
    );
    const row = rows[0];
    if (
      !row ||
      !this.sources.has(row.source) ||
      !(await canReadNotification(this.db, this.access, {
        collection: row.collection,
        item: row.item,
      }))
    ) {
      throw new ItemError("Notification not found", 404);
    }
    await this.db(inboxTable)
      .where({ id, user_id: this.access.principal.id })
      .whereNull("read_at")
      .update({ read_at: this.db.fn.now() });
  }

  async readAll(before: string): Promise<void> {
    await this.db(inboxTable)
      .where({ user_id: this.access.principal.id })
      .where("created_at", "<=", before)
      .whereNull("read_at")
      .update({ read_at: this.db.fn.now() });
  }
}
