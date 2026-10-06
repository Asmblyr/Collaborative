"use client";

import { useState } from "react";
import { readEditorItem } from "@/lib/item-read";
import type { RecordDraft } from "./record-draft-model";
import {
  draftTargets,
  findDraftConflicts,
  type DraftSnapshot,
  type DraftConflict,
} from "./draft-conflicts";
import { useUiCopy } from "@/lib/ui-copy";

interface ConflictReview {
  draft: RecordDraft;
  snapshots: DraftSnapshot[];
  conflicts: DraftConflict[];
}

export function useDraftConflicts(collection: string) {
  const copy = useUiCopy();

  const [review, setReview] = useState<ConflictReview | null>(null);
  async function inspect(draft: RecordDraft) {
    const snapshots = await Promise.all(
      draftTargets(collection, draft).map(async (target) => {
        const result = await readEditorItem(
          target.collection,
          target.draft.id!,
          undefined,
          target.draft.itemEndpoint,
        );
        return { ...target, current: result.data };
      }),
    );
    setReview({
      draft,
      snapshots,
      conflicts: findDraftConflicts(snapshots, copy),
    });
  }
  return { review, inspect, clear: () => setReview(null) };
}
