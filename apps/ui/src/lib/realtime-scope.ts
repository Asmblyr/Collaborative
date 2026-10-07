import type {
  PresenceScope,
  RealtimeConnectionState,
  RealtimeEvent,
} from "@asmblyr-collaborative/contracts";
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
    state: RealtimeConnectionState;
  }
>();

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
      state: connection.state,
      close: () => connection.close(),
    };
    const entry = active;
    const unsubscribe = connection.subscribe(scope, (event) => {
      for (const subscriber of listeners) subscriber(event, entry.state);
    });
    const unsubscribeState = connection.onState((state) => {
      entry.state = state;
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
  return () => {
    active.listeners.delete(listener);
    if (!active.listeners.size) {
      active.close();
      scopes.delete(key);
    }
  };
}
