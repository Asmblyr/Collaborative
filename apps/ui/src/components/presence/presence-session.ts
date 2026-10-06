import type { PresenceResult } from "@asmblyr-collaborative/contracts";

/** Do not overlap heartbeats or let a late response resurrect a closed view. */
export function createPresenceSession(
  touch: () => Promise<PresenceResult>,
  leave: () => Promise<unknown>,
  onChange: (result: PresenceResult | null) => void,
) {
  let disposed = false;
  let pending = false;
  async function release() {
    try {
      await leave();
    } catch {
      /* TTL handles a tab closing offline. */
    }
  }
  return {
    async refresh(): Promise<void> {
      if (disposed || pending) {
        return;
      }
      pending = true;
      try {
        const result = await touch();
        if (!disposed) {
          onChange(result);
        }
      } catch {
        if (!disposed) {
          onChange(null);
        }
      } finally {
        pending = false;
        if (disposed) {
          await release();
        }
      }
    },
    dispose(): void {
      if (disposed) {
        return;
      }
      disposed = true;
      void release();
    },
  };
}
