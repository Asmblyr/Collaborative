import { randomUUID } from "node:crypto";
import type { Knex } from "knex";

/** Cancellation is shared; AbortControllers stay with the process running the response. */
export class AssistantRequests {
  private readonly pending = new Map<string, AbortController>();
  private polling = false;
  private readonly timer: ReturnType<typeof setInterval>;

  constructor(
    private readonly db: Knex | null,
    private readonly onError: () => void,
  ) {
    this.timer = setInterval(() => void this.poll(), 500);
    this.timer.unref();
  }

  async add(userId: string, controller: AbortController): Promise<string> {
    if (!this.db) {
      throw new Error("Database unavailable");
    }
    const id = randomUUID();
    await this.db("public.asmblyr_assistant_cancellations").insert({
      id,
      user_id: userId,
      expires_at: new Date(Date.now() + 11 * 60000),
    });
    this.pending.set(id, controller);
    return id;
  }

  async cancel(id: string, userId: string): Promise<boolean> {
    if (
      !this.db ||
      !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(id)
    ) {
      return false;
    }
    const changed = await this.db("public.asmblyr_assistant_cancellations")
      .where({ id, user_id: userId })
      .where("expires_at", ">", this.db.fn.now())
      .update({ cancel_requested: true });
    if (changed) {
      this.pending.get(id)?.abort();
    }
    return changed > 0;
  }

  async remove(id: string): Promise<void> {
    this.pending.delete(id);
    await this.db?.("public.asmblyr_assistant_cancellations")
      .where({ id })
      .delete();
  }

  close(): void {
    clearInterval(this.timer);
    for (const controller of this.pending.values()) {
      controller.abort();
    }
  }

  private async poll(): Promise<void> {
    if (!this.db || this.polling || !this.pending.size) {
      return;
    }
    this.polling = true;
    try {
      const rows = await this.db("public.asmblyr_assistant_cancellations")
        .whereIn("id", [...this.pending.keys()])
        .where({ cancel_requested: true })
        .select("id");
      for (const row of rows) {
        this.pending.get(row.id)?.abort();
      }
    } catch {
      this.onError();
    } finally {
      this.polling = false;
    }
  }
}
