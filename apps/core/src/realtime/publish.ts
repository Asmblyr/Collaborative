import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import type {
  RealtimeEvent,
  RealtimeEnvelope,
  RealtimePayloads,
} from "@asmblyr-collaborative/contracts";
import { realtimeChannel } from "./bus.js";

export function realtimeEvent<T extends keyof RealtimePayloads>(
  type: T,
  actor: RealtimeEvent["actor"],
  payload: RealtimePayloads[T],
): RealtimeEnvelope<T, RealtimePayloads[T]> {
  return {
    id: randomUUID(),
    type,
    timestamp: new Date().toISOString(),
    workspaceId: null,
    actor,
    payload,
  };
}

export async function publishRealtime(
  transaction: Knex | Knex.Transaction,
  event: RealtimeEvent,
): Promise<void> {
  await transaction.raw("SELECT pg_notify(?, ?)", [
    realtimeChannel,
    JSON.stringify(event),
  ]);
}
