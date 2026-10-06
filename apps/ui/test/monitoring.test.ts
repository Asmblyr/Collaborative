import assert from "node:assert/strict";
import test from "node:test";
import type { BrowserMonitoringConfig } from "@asmblyr-collaborative/contracts";
import { BrowserMonitorController } from "../src/lib/monitoring/controller";

const disabled: BrowserMonitoringConfig = {
  enabled: false,
  dsn: "",
  environment: "test",
  release: "",
  errors: false,
  performance: false,
  tracesSampleRate: 0,
};

test("browser monitoring starts once, rotates, stops on disable/failure and retries safely", async () => {
  let value = disabled;
  let started = 0;
  let stopped = 0;
  let unavailable = false;
  const monitor = new BrowserMonitorController(
    async () => {
      if (unavailable) throw new Error("offline");
      return value;
    },
    async () => {
      started++;
      return async () => {
        stopped++;
      };
    },
  );
  await monitor.refresh();
  assert.equal(started, 0);
  value = {
    ...disabled,
    enabled: true,
    errors: true,
    dsn: "https://abc@example.test/1",
  };
  await Promise.all([monitor.refresh(), monitor.refresh()]);
  await monitor.refresh();
  assert.equal(started, 1);
  value = { ...value, release: "next" };
  await monitor.refresh();
  assert.equal(started, 2);
  assert.equal(stopped, 1);
  unavailable = true;
  await monitor.refresh();
  assert.equal(stopped, 2);
  unavailable = false;
  await monitor.refresh();
  assert.equal(started, 3);
  value = disabled;
  await monitor.refresh();
  assert.equal(stopped, 3);
  await monitor.close();
  await monitor.refresh();
  assert.equal(started, 3);
});

test("unmount while the SDK loads closes any late client and never resurrects monitoring", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let stopped = 0;
  const monitor = new BrowserMonitorController(
    async () => ({
      ...disabled,
      enabled: true,
      errors: true,
      dsn: "https://abc@example.test/1",
    }),
    async () => {
      await pending;
      return async () => {
        stopped++;
      };
    },
  );
  const update = monitor.refresh();
  await new Promise((resolve) => setImmediate(resolve));
  const close = monitor.close();
  finish();
  await Promise.all([close, update]);
  assert.equal(stopped, 1);
});
