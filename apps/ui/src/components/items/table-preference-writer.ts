import type { TableQueryPatch } from "@/lib/table-preferences";

type Status = "idle" | "saving" | "error";

/** Keeps the last changes queued even when list navigation remounts its editor. */
export class TablePreferenceWriter {
  private pending: TableQueryPatch = {};
  private running = false;
  private completion = Promise.resolve();
  private status: Status = "idle";
  private listeners = new Set<() => void>();

  constructor(private send: (patch: TableQueryPatch) => Promise<unknown>) {}

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): Status => this.status;

  save = (patch: TableQueryPatch): Promise<void> => {
    this.pending = { ...this.pending, ...patch };
    if (!this.running && Object.keys(this.pending).length) {
      this.running = true;
      this.completion = this.drain();
    }
    return this.completion;
  };

  retry = () => this.save({});

  private publish(status: Status) {
    this.status = status;
    for (const listener of this.listeners) {
      listener();
    }
  }

  private async drain() {
    this.publish("saving");
    let failed = false;
    try {
      while (Object.keys(this.pending).length) {
        const patch = this.pending;
        this.pending = {};
        try {
          await this.send(patch);
        } catch {
          this.pending = { ...patch, ...this.pending };
          failed = true;
          return;
        }
      }
    } finally {
      this.running = false;
      this.publish(failed ? "error" : "idle");
    }
  }
}
