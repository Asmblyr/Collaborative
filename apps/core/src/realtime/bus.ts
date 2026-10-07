import pg from "pg";
import type { Client } from "pg";
import { randomUUID } from "node:crypto";
import type {
  PresenceScope,
  RealtimeEvent,
} from "@asmblyr-collaborative/contracts";

export const realtimeChannel = "asmblyr_realtime";
export type RealtimeListener = (event: RealtimeEvent) => void;

export interface RealtimeBus {
  publish(event: RealtimeEvent): Promise<void>;
  subscribe(scope: PresenceScope, listener: RealtimeListener): () => void;
  close(): Promise<void>;
}

function scopeKeys(scope: PresenceScope): string[] {
  const presence = `presence:${JSON.stringify(scope)}`;
  if (scope.kind === "page") return [presence];
  if (scope.kind === "collection") {
    return [presence, `collection:${scope.collection}`];
  }
  return [presence, `record:${JSON.stringify([scope.collection, scope.id])}`];
}

function eventKeys(event: RealtimeEvent): string[] | null {
  if (event.type === "presence.changed") {
    return [`presence:${JSON.stringify(event.payload.scope)}`];
  }
  if (event.type === "collection.changed") {
    return event.payload.collection
      ? [`collection:${event.payload.collection}`]
      : null;
  }
  if (event.type === "field.locked" || event.type === "field.unlocked") {
    return [
      `record:${JSON.stringify([event.payload.collection, event.payload.recordId])}`,
    ];
  }
  return [
    `collection:${event.payload.collection}`,
    `record:${JSON.stringify([event.payload.collection, event.payload.recordId])}`,
  ];
}

export class InMemoryRealtimeBus implements RealtimeBus {
  private readonly listeners = new Map<string, Set<RealtimeListener>>();

  async publish(event: RealtimeEvent): Promise<void> {
    const keys = eventKeys(event);
    const groups =
      keys === null
        ? this.listeners.values()
        : keys.map((key) => this.listeners.get(key));
    const recipients = new Set<RealtimeListener>();
    for (const group of groups) {
      for (const listener of group ?? []) {
        recipients.add(listener);
      }
    }
    for (const listener of recipients) listener(event);
  }

  subscribe(scope: PresenceScope, listener: RealtimeListener): () => void {
    const keys = scopeKeys(scope);
    for (const key of keys) {
      const group = this.listeners.get(key) ?? new Set<RealtimeListener>();
      group.add(listener);
      this.listeners.set(key, group);
    }
    return () => {
      for (const key of keys) {
        const group = this.listeners.get(key);
        group?.delete(listener);
        if (!group?.size) this.listeners.delete(key);
      }
    };
  }

  async close(): Promise<void> {
    this.listeners.clear();
  }
}

/** PostgreSQL delivers notifications only after the writing transaction commits. */
export class PostgresRealtimeBus implements RealtimeBus {
  private readonly local = new InMemoryRealtimeBus();
  private client: Client | null = null;
  private retry: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private started = false;

  constructor(
    private readonly databaseUrl: string,
    private readonly report: (error: Error) => void,
  ) {}

  async start(): Promise<void> {
    if (this.closed || this.client) {
      return;
    }
    const client = new pg.Client({ connectionString: this.databaseUrl });
    this.client = client;
    client.on("error", (error) => this.disconnected(client, error));
    client.on("end", () => this.disconnected(client));
    client.on("notification", (notification) => {
      if (notification.channel !== realtimeChannel || !notification.payload) {
        return;
      }
      try {
        const event = JSON.parse(notification.payload) as RealtimeEvent;
        if (
          event &&
          typeof event.type === "string" &&
          typeof event.id === "string" &&
          event.payload &&
          typeof event.payload === "object"
        ) {
          void this.local.publish(event).catch((error: unknown) => {
            this.report(error as Error);
          });
        }
      } catch {
        // Malformed notifications cannot interrupt other subscribers.
      }
    });
    try {
      await client.connect();
      await client.query(`LISTEN ${realtimeChannel}`);
      if (this.started) {
        this.local.publish({
          id: randomUUID(),
          type: "collection.changed",
          timestamp: new Date().toISOString(),
          workspaceId: null,
          actor: null,
          payload: { collection: "" },
        });
      }
      this.started = true;
    } catch (error) {
      if (this.client === client) {
        this.client = null;
      }
      await client.end().catch(() => undefined);
      this.report(error as Error);
      this.scheduleRetry();
    }
  }

  private disconnected(client: Client, error?: Error): void {
    if (client !== this.client) {
      return;
    }
    this.client = null;
    if (error) {
      this.report(error);
    }
    this.scheduleRetry();
  }

  private scheduleRetry(): void {
    if (this.closed || this.retry) {
      return;
    }
    this.retry = setTimeout(
      () => {
        this.retry = null;
        void this.start();
      },
      1000 + Math.random() * 2000,
    );
    this.retry.unref();
  }

  subscribe(scope: PresenceScope, listener: RealtimeListener): () => void {
    return this.local.subscribe(scope, listener);
  }

  async publish(event: RealtimeEvent): Promise<void> {
    if (!this.client) {
      throw new Error("Realtime listener unavailable");
    }
    await this.client.query("SELECT pg_notify($1, $2)", [
      realtimeChannel,
      JSON.stringify(event),
    ]);
  }

  async close(): Promise<void> {
    this.closed = true;
    if (this.retry) {
      clearTimeout(this.retry);
    }
    await this.client?.end();
    await this.local.close();
  }
}
