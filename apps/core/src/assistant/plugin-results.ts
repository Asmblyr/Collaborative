import type {
  AssistantPluginResult,
  PluginPreparedAction,
} from "@asmblyr-collaborative/contracts";
import type { PluginActions } from "../plugins/actions.js";
import type { Access } from "../permissions/access.js";
import { ItemError } from "../items/validation.js";

/** References only successful results captured in this turn; the model cannot invent page state. */
export class PluginResults {
  readonly cards: AssistantPluginResult[] = [];
  private readonly prepared = new Map<string, PluginPreparedAction>();

  capture(result: object): void {
    if (!("prepared" in result)) return;
    const prepared = result.prepared as PluginPreparedAction;
    this.prepared.set(prepared.draftId, prepared);
  }

  async present(
    actions: PluginActions | undefined,
    access: Access,
    args: Record<string, unknown>,
  ): Promise<object> {
    const draft =
      typeof args.resultId === "string"
        ? this.prepared.get(args.resultId)
        : undefined;
    if (!actions || !draft) throw new ItemError("Unknown action result", 400);
    const checked = await actions.prepared(
      access,
      draft.namespace,
      draft.draftId,
    );
    const card = {
      draftId: checked.draftId,
      namespace: checked.namespace,
      title: checked.title,
      expiresAt: checked.expiresAt,
    };
    const index = this.cards.findIndex(
      (entry) => entry.draftId === card.draftId,
    );
    if (index < 0) this.cards.push(card);
    else this.cards[index] = card;
    return { presented: true, requiresUserClick: true };
  }
}
