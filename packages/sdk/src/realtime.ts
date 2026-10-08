import type {
  PresenceScope,
  RealtimeConnectionState,
  RealtimeEvent,
} from "@asmblyr-collaborative/contracts";
import type { ClientOptions } from "./options.js";
import type { Transport } from "./transport.js";
import { responseError } from "./error.js";

export interface RealtimeLock {
  collection: string;
  recordId: string;
  field: string;
  clientId: string;
}

export interface RealtimeConnection {
  readonly state: RealtimeConnectionState;
  subscribe(
    scope: PresenceScope,
    callback: (event: RealtimeEvent) => void,
  ): () => void;
  on<T extends RealtimeEvent["type"]>(
    type: T,
    callback: (event: RealtimeEvent & { type: T }) => void,
  ): () => void;
  onState(callback: (state: RealtimeConnectionState) => void): () => void;
  locks: {
    acquire(input: RealtimeLock): Promise<unknown>;
    refresh(input: RealtimeLock): Promise<unknown>;
    release(input: RealtimeLock): Promise<void>;
  };
  close(): void;
}

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });

export function createRealtimeClient(
  options: ClientOptions,
  transport: Transport,
) {
  return {
    connect(): RealtimeConnection {
      let state: RealtimeConnectionState = "connecting";
      let closed = false;
      const controllers = new Set<AbortController>();
      const stateListeners = new Set<
        (state: RealtimeConnectionState) => void
      >();
      const listeners = new Map<
        RealtimeEvent["type"],
        Set<(event: RealtimeEvent) => void>
      >();
      const heldLocks = new Map<string, RealtimeLock>();
      const fetcher = options.fetch ?? globalThis.fetch;
      const root = options.baseUrl.replace(/\/+$/, "");
      const lockKey = (input: RealtimeLock) => JSON.stringify(input);
      function setState(next: RealtimeConnectionState) {
        if (state === next) return;
        state = next;
        for (const listener of stateListeners) listener(next);
      }
      function dispatch(
        event: RealtimeEvent,
        callback: (event: RealtimeEvent) => void,
        recentIds: Set<string>,
      ) {
        if (recentIds.has(event.id)) return;
        recentIds.add(event.id);
        if (recentIds.size > 256)
          recentIds.delete(recentIds.values().next().value!);
        callback(event);
        for (const listener of listeners.get(event.type) ?? []) listener(event);
      }
      async function stream(
        scope: PresenceScope,
        callback: (event: RealtimeEvent) => void,
        controller: AbortController,
      ) {
        let attempt = 0;
        const clientId = crypto.randomUUID();
        const recentIds = new Set<string>();
        while (!controller.signal.aborted && !closed) {
          setState(attempt ? "reconnecting" : "connecting");
          let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
          try {
            const token =
              typeof options.accessToken === "function"
                ? await options.accessToken()
                : options.accessToken;
            const headers = new Headers(options.headers);
            headers.set("accept", "text/event-stream");
            if (token) headers.set("authorization", `Bearer ${token}`);
            const query = new URLSearchParams({
              clientId,
              scope: JSON.stringify(scope),
            });
            const response = await fetcher(`${root}/realtime/stream?${query}`, {
              headers,
              credentials: options.credentials ?? "same-origin",
              cache: "no-store",
              signal: controller.signal,
              redirect: "error",
            });
            if (!response.ok) throw await responseError(response);
            if (!response.body) throw new Error("Realtime stream unavailable");
            setState("connected");
            if (attempt) {
              // A reconnect may have missed events; callers refetch from the HTTP API.
              dispatch(
                {
                  id: crypto.randomUUID(),
                  type: "collection.changed",
                  timestamp: new Date().toISOString(),
                  workspaceId: null,
                  actor: null,
                  payload: {
                    collection: scope.kind === "page" ? "" : scope.collection,
                  },
                },
                callback,
                recentIds,
              );
              for (const lock of heldLocks.values()) {
                if (
                  scope.kind === "record" &&
                  lock.collection === scope.collection &&
                  lock.recordId === scope.id
                ) {
                  await transport
                    .write("POST", "/realtime/locks", lock)
                    .catch(() => undefined);
                }
              }
            }
            attempt = 0;
            reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            while (!controller.signal.aborted) {
              const { done, value } = await reader.read();
              if (done) break;
              buffer += decoder.decode(value, { stream: true });
              if (buffer.length > 64_000)
                throw new Error("Realtime frame too large");
              let boundary = buffer.indexOf("\n\n");
              while (boundary >= 0) {
                const frame = buffer.slice(0, boundary);
                buffer = buffer.slice(boundary + 2);
                const data = frame
                  .split("\n")
                  .filter((line) => line.startsWith("data: "))
                  .map((line) => line.slice(6))
                  .join("\n");
                if (data)
                  dispatch(
                    JSON.parse(data) as RealtimeEvent,
                    callback,
                    recentIds,
                  );
                boundary = buffer.indexOf("\n\n");
              }
            }
          } catch (error) {
            if (controller.signal.aborted || closed) break;
            if (
              error &&
              typeof error === "object" &&
              "status" in error &&
              (error.status === 401 ||
                error.status === 403 ||
                error.status === 404)
            ) {
              setState("offline");
              break;
            }
          } finally {
            await reader?.cancel().catch(() => undefined);
            reader?.releaseLock();
          }
          if (controller.signal.aborted || closed) break;
          attempt += 1;
          setState("reconnecting");
          const backoff = Math.min(30_000, 500 * 2 ** Math.min(attempt, 6));
          await sleep(backoff * (0.5 + Math.random()), controller.signal);
        }
        controllers.delete(controller);
        if (!controllers.size) setState("offline");
      }
      return {
        get state() {
          return state;
        },
        subscribe(scope, callback) {
          if (closed) throw new Error("Realtime connection closed");
          const controller = new AbortController();
          controllers.add(controller);
          void stream(scope, callback, controller);
          return () => {
            controller.abort();
            controllers.delete(controller);
            if (!controllers.size) setState("offline");
          };
        },
        on(type, callback) {
          const group = listeners.get(type) ?? new Set();
          group.add(callback as (event: RealtimeEvent) => void);
          listeners.set(type, group);
          return () => group.delete(callback as (event: RealtimeEvent) => void);
        },
        onState(callback) {
          stateListeners.add(callback);
          callback(state);
          return () => stateListeners.delete(callback);
        },
        locks: {
          async acquire(input) {
            const result = await transport.write(
              "POST",
              "/realtime/locks",
              input,
            );
            heldLocks.set(lockKey(input), input);
            return result;
          },
          async refresh(input) {
            return transport.write("POST", "/realtime/locks", input);
          },
          async release(input) {
            heldLocks.delete(lockKey(input));
            await transport.write("DELETE", "/realtime/locks", input);
          },
        },
        close() {
          closed = true;
          for (const controller of controllers) controller.abort();
          controllers.clear();
          for (const lock of heldLocks.values()) {
            void transport
              .write("DELETE", "/realtime/locks", lock)
              .catch(() => undefined);
          }
          heldLocks.clear();
          setState("offline");
        },
      };
    },
  };
}
