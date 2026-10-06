import type { Knex } from "knex";
import type { AssistantTurnSummary } from "@asmblyr-collaborative/contracts";
import { AssistantProviderError } from "../provider.js";

export function createTurnJournal(database: Knex, warn: (id: string) => void) {
  const table = () => database("asmblyr_assistant_turns").withSchema("public");
  return {
    async startTurn(id: string, userId: string): Promise<void> {
      try {
        await table()
          .insert({ id, user_id: userId, started_at: new Date() })
          .timeout(5000, { cancel: true });
      } catch {
        throw new AssistantProviderError(
          503,
          "assistant_telemetry_unavailable",
          "Не удалось записать AI-запрос. Попробуйте позже.",
        );
      }
    },
    async finishTurn(summary: AssistantTurnSummary): Promise<void> {
      try {
        await table()
          .where({ id: summary.turnId })
          .update({
            finished_at: new Date(),
            summary: JSON.stringify(summary),
          })
          .timeout(5000, { cancel: true });
      } catch {
        // Keep the unfinished row; do not discard the answer or log private content.
        warn(summary.turnId);
      }
    },
  };
}
