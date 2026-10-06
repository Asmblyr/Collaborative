import assert from "node:assert/strict";
import test from "node:test";
import { startBrowserMonitoring } from "../src/lib/monitoring/browser-runtime";

test("browser SDK emits redacted errors and allowed timing events, then removes observers/listeners", async () => {
  const previous = Object.fromEntries(
    ["window", "location", "PerformanceObserver"].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  const window = new EventTarget();
  const observers: Observer[] = [];
  class Observer {
    static supportedEntryTypes = ["resource", "navigation"];
    type = "";
    disconnected = false;
    constructor(readonly callback: (list: { getEntries(): object[] }) => void) {
      observers.push(this);
    }
    observe(options: { type: string }) {
      this.type = options.type;
    }
    disconnect() {
      this.disconnected = true;
    }
    emit(entry: object) {
      this.callback({ getEntries: () => [entry] });
    }
  }
  Object.defineProperties(globalThis, {
    window: { value: window, configurable: true },
    location: {
      value: {
        pathname: "/items/private-collection/private-id",
        origin: "http://localhost",
      },
      configurable: true,
    },
    PerformanceObserver: { value: Observer, configurable: true },
  });
  const envelopes: unknown[] = [];
  let stop: (() => Promise<void>) | undefined;
  try {
    stop = startBrowserMonitoring(
      {
        enabled: true,
        dsn: "https://abc@example.test/1",
        environment: "test",
        release: "test-1",
        errors: true,
        performance: true,
        tracesSampleRate: 1,
      },
      () => ({
        send(envelope) {
          envelopes.push(envelope);
          return Promise.resolve({});
        },
        flush() {
          return Promise.resolve(true);
        },
      }),
    );
    window.dispatchEvent(
      Object.assign(new Event("error"), {
        error: new TypeError("private-error"),
      }),
    );
    window.dispatchEvent(
      Object.assign(new Event("unhandledrejection"), {
        reason: new Error("private-rejection"),
      }),
    );
    const resource = observers.find(
      (observer) => observer.type === "resource",
    )!;
    resource.emit({
      name: "http://localhost/api/items/private-collection/private-id?token=private-token",
      startTime: 10,
      duration: 50,
      initiatorType: "fetch",
    });
    resource.emit({
      name: "https://external.test/api/items/private-id",
      startTime: 10,
      duration: 50,
      initiatorType: "fetch",
    });
    resource.emit({
      name: "http://localhost/api/auth/renew?token=private-token",
      startTime: 10,
      duration: 50,
      initiatorType: "fetch",
    });
    observers
      .find((observer) => observer.type === "navigation")!
      .emit({
        name: "http://localhost/admin/settings/private-section",
        startTime: 0,
        duration: 100,
      });
    await stop();
    const serialized = JSON.stringify(envelopes);
    assert.equal(serialized.includes("private-"), false);
    const events = (
      envelopes as [unknown, [unknown, Record<string, unknown>][]][]
    ).flatMap((envelope) => envelope[1].map((item) => item[1]));
    assert.equal(events.length, 4, serialized);
    const traces = events.filter((event) => event.type === "transaction");
    assert.equal(traces.length, 2);
    assert.equal(traces[0].transaction, "/api/items/:collection/:id");
    assert.ok(
      Math.abs(
        (Number(traces[0].timestamp) - Number(traces[0].start_timestamp)) *
          1000 -
          50,
      ) < 0.001,
    );
    assert.equal(
      observers.every((observer) => observer.disconnected),
      true,
    );
    window.dispatchEvent(
      Object.assign(new Event("error"), { error: new Error("after close") }),
    );
    assert.equal(envelopes.length, 4);
  } finally {
    await stop?.();
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  }
});
