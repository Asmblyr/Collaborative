/** Request-bound inbox events. Core chooses recipients from record subscriptions. */
export interface NotificationRecord {
  collection: string;
  item: string;
}

export interface RecordNotificationInput extends NotificationRecord {
  eventId: string;
  panelId: string;
  targetId: string;
  /** Plain text excerpt; never HTML or a destination URL. */
  preview: string;
}

/** Requires the notifications capability. Not available to model handlers. */
export interface RecordNotifications {
  following(target: NotificationRecord): Promise<boolean>;
  follow(target: NotificationRecord, enabled: boolean): Promise<void>;
  /** Auto-follows the human author unless explicitly muted; never notifies themself. */
  publish(input: RecordNotificationInput): Promise<void>;
  /** Refresh a plain-text excerpt without delivering a new event. */
  update(eventId: string, preview: string): Promise<void>;
  /** Remove an event owned by this plugin, e.g. when its comment is deleted. */
  remove(eventId: string): Promise<void>;
}
