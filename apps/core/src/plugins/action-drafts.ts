import { randomUUID } from "node:crypto";
import type { PluginPreparedAction } from "@asmblyr-collaborative/contracts";
import { ItemError } from "../items/validation.js";

interface StoredDraft {
  owner: string;
  expires: number;
  value: PluginPreparedAction;
}

/** Ephemeral calculations only. Per-process, bounded, and inaccessible to other principals. */
export class ActionDrafts {
  private readonly drafts = new Map<string, StoredDraft>();
  constructor(
    private readonly now = Date.now,
    private readonly ttlMs = 20 * 60_000,
  ) {}

  private prune() {
    const now = this.now();
    for (const [id, draft] of this.drafts) {
      if (draft.expires <= now) this.drafts.delete(id);
    }
  }

  create(
    owner: string,
    value: Omit<PluginPreparedAction, "draftId" | "expiresAt" | "href">,
  ): PluginPreparedAction {
    this.prune();
    const ownCount = [...this.drafts.values()].filter(
      (draft) => draft.owner === owner,
    ).length;
    if (ownCount >= 32 || this.drafts.size >= 256) {
      throw new ItemError(
        "Слишком много подготовленных форм. Повторите позже.",
        429,
      );
    }
    const expires = this.now() + this.ttlMs;
    const draftId = randomUUID();
    const draft = {
      ...structuredClone(value),
      draftId,
      expiresAt: new Date(expires).toISOString(),
      href: `/extensions/${value.namespace}/${value.pageId}?draft=${draftId}`,
    };
    this.drafts.set(draftId, { owner, expires, value: draft });
    return structuredClone(draft);
  }

  get(owner: string, namespace: string, id: string): PluginPreparedAction {
    this.prune();
    const draft = this.drafts.get(id);
    if (
      !draft ||
      draft.owner !== owner ||
      draft.value.namespace !== namespace
    ) {
      throw new ItemError(
        "Подготовленная форма недоступна или срок её хранения истёк.",
        404,
      );
    }
    return structuredClone(draft.value);
  }
}
