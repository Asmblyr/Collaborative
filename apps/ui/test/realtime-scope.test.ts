import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import type {
  PresenceScope,
  RealtimeConnectionState,
  RealtimeEvent,
} from "@asmblyr-collaborative/contracts";
import { asmblyr } from "../src/lib/asmblyr";
import { subscribeRealtime } from "../src/lib/realtime-scope";

const scope: PresenceScope = {
  kind: "record",
  collection: "articles",
  id: "4",
};
const presence: RealtimeEvent = {
  id: "presence",
  type: "presence.changed",
  timestamp: "2026-10-09T00:00:00.000Z",
  workspaceId: null,
  actor: null,
  payload: {
    scope,
    participants: [
      {
        id: "reader",
        displayName: "Reader",
        pictureUrl: null,
        self: false,
        views: 1,
      },
    ],
    total: 1,
  },
};

function setup(t: TestContext) {
  let state: RealtimeConnectionState = "connecting";
  let receive: (event: RealtimeEvent) => void = () => {};
  let updateState: (state: RealtimeConnectionState) => void = () => {};
  const close = t.mock.fn();
  const unsubscribe = t.mock.fn();
  const unsubscribeState = t.mock.fn();
  const connect = t.mock.method(asmblyr.realtime, "connect", () => ({
    get state() {
      return state;
    },
    subscribe(_scope: PresenceScope, listener: typeof receive) {
      receive = listener;
      return unsubscribe;
    },
    onState(listener: typeof updateState) {
      updateState = listener;
      listener(state);
      return unsubscribeState;
    },
    close,
  }));
  const cleanups = new Set<() => void>();
  t.after(() => cleanups.forEach((cleanup) => cleanup()));
  return {
    close,
    connect,
    unsubscribe,
    unsubscribeState,
    emit: (event: RealtimeEvent) => receive(event),
    setState(next: RealtimeConnectionState) {
      state = next;
      updateState(next);
    },
    subscribe() {
      const listener = t.mock.fn();
      const unsubscribe = subscribeRealtime(scope, listener);
      const stop = () => {
        if (cleanups.delete(stop)) {
          unsubscribe();
        }
      };
      cleanups.add(stop);
      return { listener, stop };
    },
  };
}

test("late subscribers immediately receive current state and the latest presence, not past mutations", (t) => {
  const live = setup(t);
  const first = live.subscribe();
  assert.deepEqual(first.listener.mock.calls[0].arguments, [
    null,
    "connecting",
  ]);
  live.setState("connected");
  live.emit(presence);
  const latest: RealtimeEvent = {
    ...presence,
    id: "empty-presence",
    payload: { scope, participants: [], total: 0 },
  };
  live.emit(latest);
  live.emit({
    id: "mutation",
    type: "collection.changed",
    timestamp: presence.timestamp,
    workspaceId: null,
    actor: null,
    payload: { collection: "articles" },
  });

  const late = live.subscribe();
  assert.equal(live.connect.mock.callCount(), 1);
  assert.equal(late.listener.mock.callCount(), 1);
  assert.deepEqual(late.listener.mock.calls[0].arguments, [
    latest,
    "connected",
  ]);
  live.emit(presence);
  assert.deepEqual(late.listener.mock.calls[1].arguments, [
    presence,
    "connected",
  ]);
});

test("subscribers joining after a disconnect do not receive stale presence", (t) => {
  const live = setup(t);
  live.subscribe();
  live.setState("connected");
  live.emit(presence);
  live.setState("reconnecting");
  const late = live.subscribe();
  assert.deepEqual(late.listener.mock.calls[0].arguments, [
    null,
    "reconnecting",
  ]);
  live.setState("connected");
  const restored = live.subscribe();
  assert.deepEqual(restored.listener.mock.calls[0].arguments, [
    null,
    "connected",
  ]);
  live.emit(presence);
  assert.deepEqual(restored.listener.mock.calls[1].arguments, [
    presence,
    "connected",
  ]);
});

test("the last subscriber closes the shared stream and a new subscription starts without cached presence", (t) => {
  const live = setup(t);
  const first = live.subscribe();
  const second = live.subscribe();
  live.setState("connected");
  live.emit(presence);
  first.stop();
  assert.equal(live.close.mock.callCount(), 0);
  second.stop();
  assert.equal(live.close.mock.callCount(), 1);
  assert.equal(live.unsubscribe.mock.callCount(), 1);
  assert.equal(live.unsubscribeState.mock.callCount(), 1);
  const next = live.subscribe();
  assert.equal(live.connect.mock.callCount(), 2);
  assert.deepEqual(next.listener.mock.calls[0].arguments, [null, "connected"]);
});
