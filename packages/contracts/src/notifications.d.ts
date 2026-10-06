export interface NotificationItem {
  id: string;
  source: string;
  panelId: string;
  targetId: string;
  collection: string;
  collectionDisplayName: string | null;
  item: string;
  actorName: string | null;
  preview: string;
  createdAt: string;
  readAt: string | null;
}

export interface NotificationResult {
  data: NotificationItem[];
  unread: number;
  total: number;
  /** Server snapshot boundary for marking all current notifications read. */
  readBefore: string;
}
