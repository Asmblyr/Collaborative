import { createHash } from "node:crypto";
import type { Knex } from "knex";
import { collectionSchema } from "../items/schema-repository.js";
import { grantFor, type Access } from "../permissions/access.js";

const DEFAULT_TTL_MS = 60 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 1024;

interface CachedSchemaEntry {
  collectionId: string;
  revision: string;
  savedAt: number;
}

export type LoadedCollectionSchema = Awaited<
  ReturnType<typeof collectionSchema>
>;

export function computeCollectionSchemaRevision(
  schema: LoadedCollectionSchema,
  access: Access,
  collection: string,
): string {
  const fields = [...schema.fields.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, field]) => ({
      name,
      type: field.type,
      nullable: field.nullable,
      required: field.required,
      maxLength: field.maxLength ?? null,
      relation: field.relation ?? null,
      label: field.presentation?.label ?? null,
      options: field.presentation?.options ?? null,
    }));
  const payload = {
    internalId: schema.settings.internalId,
    displayName: schema.settings.displayName ?? null,
    mcpEnabled: schema.settings.mcp?.enabled ?? true,
    primaryKey: schema.settings.primaryKey,
    timestamps: schema.settings.timestamps,
    state: schema.settings.state ?? null,
    grants: {
      read: grantFor(access, collection, "read"),
      create: grantFor(access, collection, "create"),
      update: grantFor(access, collection, "update"),
    },
    fields,
  };
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export class SessionSchemaCache {
  private readonly sessions = new Map<
    string,
    { updatedAt: number; collections: Map<string, CachedSchemaEntry> }
  >();
  private readonly ttlMs: number;
  private readonly maxSessions: number;
  private readonly now: () => number;

  constructor(
    options: {
      ttlMs?: number;
      maxSessions?: number;
      now?: () => number;
    } = {},
  ) {
    this.ttlMs = options.ttlMs ?? DEFAULT_TTL_MS;
    this.maxSessions = options.maxSessions ?? DEFAULT_MAX_SESSIONS;
    this.now = options.now ?? Date.now;
  }

  private key(sessionId: string, principalId: string): string {
    return `${principalId}:${sessionId}`;
  }

  private pruneExpired(currentTime: number): void {
    for (const [sessionKey, bucket] of this.sessions) {
      for (const [collection, entry] of bucket.collections) {
        if (currentTime - entry.savedAt > this.ttlMs) {
          bucket.collections.delete(collection);
        }
      }
      if (
        bucket.collections.size === 0 ||
        currentTime - bucket.updatedAt > this.ttlMs
      ) {
        this.sessions.delete(sessionKey);
      }
    }
  }

  getEntry(
    sessionId: string,
    principalId: string,
    collection: string,
  ): CachedSchemaEntry | undefined {
    const currentTime = this.now();
    const bucket = this.sessions.get(this.key(sessionId, principalId));
    if (!bucket) return undefined;
    const entry = bucket.collections.get(collection);
    if (!entry) return undefined;
    if (currentTime - entry.savedAt > this.ttlMs) {
      bucket.collections.delete(collection);
      if (bucket.collections.size === 0) {
        this.sessions.delete(this.key(sessionId, principalId));
      }
      return undefined;
    }
    return entry;
  }

  get(
    sessionId: string,
    principalId: string,
    collection: string,
    currentRevision: string,
  ): string | undefined {
    const entry = this.getEntry(sessionId, principalId, collection);
    if (!entry) return undefined;
    if (entry.revision !== currentRevision) {
      this.invalidate(sessionId, principalId, collection);
      return undefined;
    }
    return entry.collectionId;
  }

  set(
    sessionId: string,
    principalId: string,
    collection: string,
    collectionId: string,
    revision: string,
  ): void {
    const currentTime = this.now();
    const sessionKey = this.key(sessionId, principalId);
    let bucket = this.sessions.get(sessionKey);
    if (!bucket) {
      if (this.sessions.size >= this.maxSessions) {
        this.pruneExpired(currentTime);
      }
      if (this.sessions.size >= this.maxSessions) {
        const oldestKey = this.sessions.keys().next().value;
        if (oldestKey !== undefined) this.sessions.delete(oldestKey);
      }
      bucket = { updatedAt: currentTime, collections: new Map() };
      this.sessions.set(sessionKey, bucket);
    } else {
      // Refresh insertion order for LRU eviction.
      this.sessions.delete(sessionKey);
      this.sessions.set(sessionKey, bucket);
      bucket.updatedAt = currentTime;
    }
    bucket.collections.set(collection, {
      collectionId,
      revision,
      savedAt: currentTime,
    });
  }

  invalidate(
    sessionId: string,
    principalId: string,
    collection?: string,
  ): void {
    const sessionKey = this.key(sessionId, principalId);
    if (!collection) {
      this.sessions.delete(sessionKey);
      return;
    }
    const bucket = this.sessions.get(sessionKey);
    if (!bucket) return;
    bucket.collections.delete(collection);
    if (bucket.collections.size === 0) {
      this.sessions.delete(sessionKey);
    }
  }

  forSession(
    sessionId: string,
    principalId: string,
    db: Knex,
    getAccess: () => Promise<Access>,
    resolveRevision: (
      collection: string,
      access: Access,
    ) => Promise<{ collectionId: string; revision: string } | null> = async (
      collection,
      access,
    ) => {
      try {
        const schema = await collectionSchema(db, collection);
        if (schema.settings.mcp?.enabled === false) return null;
        return {
          collectionId: schema.settings.internalId,
          revision: computeCollectionSchemaRevision(schema, access, collection),
        };
      } catch {
        return null;
      }
    },
  ) {
    return {
      load: async (collection: string): Promise<string | undefined> => {
        const cached = this.getEntry(sessionId, principalId, collection);
        if (!cached) return undefined;
        const access = await getAccess();
        const current = await resolveRevision(collection, access);
        if (
          !current ||
          current.collectionId !== cached.collectionId ||
          current.revision !== cached.revision
        ) {
          this.invalidate(sessionId, principalId, collection);
          return undefined;
        }
        return cached.collectionId;
      },
      save: async (collection: string, collectionId: string): Promise<void> => {
        const access = await getAccess();
        const current = await resolveRevision(collection, access);
        if (!current || current.collectionId !== collectionId) return;
        this.set(
          sessionId,
          principalId,
          collection,
          collectionId,
          current.revision,
        );
      },
    };
  }
}
