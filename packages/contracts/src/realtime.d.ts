import type { PresenceScope, PresenceParticipant } from "./presence.js";

export type RealtimeConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline";

export interface RealtimeActor {
  id: string;
  kind: "user" | "service";
}

export interface RealtimeEnvelope<T extends string, P> {
  id: string;
  type: T;
  timestamp: string;
  workspaceId: string | null;
  actor: RealtimeActor | null;
  payload: P;
}

export interface RealtimePayloads {
  "presence.changed": {
    scope: PresenceScope;
    participants: PresenceParticipant[];
    total: number;
  };
  "record.created": RecordChangePayload;
  "record.updated": RecordChangePayload;
  "record.deleted": RecordChangePayload;
  "field.locked": FieldLockPayload;
  "field.unlocked": FieldLockPayload;
  "collection.changed": { collection: string };
}

export interface RecordChangePayload {
  collection: string;
  recordId: string;
  changedFields: string[];
  revision: string;
}

export interface FieldLockPayload {
  collection: string;
  recordId: string;
  field: string;
  holder: { id: string; displayName: string };
  expiresAt: string;
}

export type RealtimeEvent = {
  [T in keyof RealtimePayloads]: RealtimeEnvelope<T, RealtimePayloads[T]>;
}[keyof RealtimePayloads];

export interface RealtimeSubscription {
  clientId: string;
  scope: PresenceScope;
}
