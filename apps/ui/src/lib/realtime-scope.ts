import type {
  PresenceScope,
  RealtimeConnectionState,
  RealtimeEvent,
} from "@asmblyr-collaborative/contracts";
import type { RealtimeConnection } from "@asmblyr-collaborative/sdk";
import { asmblyr } from "./asmblyr";

type Listener = (
  event: RealtimeEvent | null,
  state: RealtimeConnectionState,
) => void;
const scopes = new Map<
  string,
  {
    listeners: Set<Listener>;
    close: () => void;
    locks?: RealtimeConnection["locks"];
    state: RealtimeConnectionState;
    presence: Extract<RealtimeEvent, { type: "presence.changed" }> | null;
  }
>();

export function getRealtimeLocks(
  scope: PresenceScope,
): RealtimeConnection["locks"] | null {
  return scopes.get(JSON.stringify(scope))?.locks ?? null;
}

/** One browser stream per scope, shared by presence and record editors. */
export function subscribeRealtime(
  scope: PresenceScope,
  listener: Listener,
): () => void {
  const key = JSON.stringify(scope);
  let active = scopes.get(key);
  if (!active) {
    const connection = asmblyr.realtime.connect();
    const listeners = new Set<Listener>();
    active = {
      listeners,
      locks: connection.locks,
      state: connection.state,
      presence: null,
      close: () => connection.close(),
    };
    const entry = active;
    const unsubscribe = connection.subscribe(scope, (event) => {
      if (event.type === "presence.changed") {
        entry.presence = event;
      }
      for (const subscriber of listeners) subscriber(event, entry.state);
    });
    const unsubscribeState = connection.onState((state) => {
      entry.state = state;
      if (state !== "connected") {
        entry.presence = null;
      }
      for (const subscriber of listeners) subscriber(null, state);
    });
    entry.close = () => {
      unsubscribeState();
      unsubscribe();
      connection.close();
    };
    scopes.set(key, entry);
  }
  active.listeners.add(listener);
  listener(active.presence, active.state);
  return () => {
    active.listeners.delete(listener);
    if (!active.listeners.size) {
      active.close();
      scopes.delete(key);
    }
  };
}
