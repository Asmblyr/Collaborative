import type { Knex } from "knex";

export const inboxTable = "asmblyr_notifications";
export const subscriptionsTable = "asmblyr_notification_subscriptions";
export const INBOX_LIMIT = 200;

export interface InboxRow {
  id: string;
  source: string;
  panel_id: string;
  target_id: string;
  collection: string;
  collection_display_name: string | null;
  item: string;
  actor_name: string | null;
  preview: string;
  created_at: Date;
  read_at: Date | null;
}

export function inboxRows(db: Knex, userId: string) {
  return db<InboxRow>(`${inboxTable} as n`)
    .join("asmblyr_collections as c", "c.id", "n.collection_id")
    .where("n.user_id", userId)
    .select(
      "n.*",
      "c.name as collection",
      "c.display_name as collection_display_name",
    )
    .orderBy("n.created_at", "desc")
    .orderBy("n.id", "desc")
    .limit(INBOX_LIMIT);
}

export async function trimInbox(db: Knex, userId: string): Promise<void> {
  const older = db(inboxTable)
    .where({ user_id: userId })
    .select("id")
    .orderBy("created_at", "desc")
    .orderBy("id", "desc")
    .offset(INBOX_LIMIT);
  await db(inboxTable).whereIn("id", older).delete();
}

export async function clearRecordNotifications(
  db: Knex,
  collectionId: string,
  item: string,
): Promise<void> {
  const target = { collection_id: collectionId, item };
  await db(inboxTable).where(target).delete();
  await db(subscriptionsTable).where(target).delete();
}
