import type { Item } from "./types";
import type { RecordDraft } from "./record-draft-model";

export interface DraftTarget {
  path: string;
  collection: string;
  draft: RecordDraft;
}
export interface DraftSnapshot extends DraftTarget {
  current: Item;
}
export interface DraftConflict {
  key: string;
  target: DraftSnapshot;
  field: string;
  mine: Item[string];
  current: Item[string];
}
export type ConflictChoices = Record<string, "mine" | "current">;

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonical);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}
function equal(a: unknown, b: unknown): boolean {
  return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
}

/** The same paths are used when collecting snapshots and applying choices. */
function mapDraft(
  collection: string,
  draft: RecordDraft,
  visit: (target: DraftTarget) => RecordDraft,
  path = "root",
): RecordDraft {
  const next = visit({ path, collection, draft });
  return {
    ...next,
    references: Object.fromEntries(
      Object.entries(next.references ?? {}).map(([field, record]) => [
        field,
        // The actual collection for a reference is attached when its editor loads it.
        mapDraft(
          record.collection ?? "",
          record,
          visit,
          `${path}/references/${field}`,
        ),
      ]),
    ),
    records: next.records?.map((entry, index) => ({
      ...entry,
      record: mapDraft(
        entry.collection,
        entry.record,
        visit,
        `${path}/records/${index}`,
      ),
    })),
    relations: Object.fromEntries(
      Object.entries(next.relations ?? {}).map(([field, relation]) => [
        field,
        {
          ...relation,
          attach: relation.attach?.map((entry, index) => ({
            ...entry,
            ...(entry.record
              ? {
                  record: mapDraft(
                    entry.record.collection ?? "",
                    entry.record,
                    visit,
                    `${path}/relations/${field}/attach/${index}`,
                  ),
                }
              : {}),
          })),
          create: relation.create?.map((entry, index) => ({
            ...entry,
            record: mapDraft(
              entry.record.collection ?? "",
              entry.record,
              visit,
              `${path}/relations/${field}/create/${index}`,
            ),
            ...(entry.link
              ? {
                  link: mapDraft(
                    entry.link.collection ?? "",
                    entry.link,
                    visit,
                    `${path}/relations/${field}/create/${index}/link`,
                  ),
                }
              : {}),
          })),
          links: relation.links?.map((entry, index) => ({
            ...entry,
            record: mapDraft(
              entry.record.collection ?? "",
              entry.record,
              visit,
              `${path}/relations/${field}/links/${index}`,
            ),
          })),
        },
      ]),
    ),
  };
}

export function draftTargets(
  collection: string,
  draft: RecordDraft,
): DraftTarget[] {
  const targets: DraftTarget[] = [];
  mapDraft(collection, draft, (target) => {
    if (target.draft.id && target.draft.baseValues) {
      targets.push(target);
    }
    return target.draft;
  });
  return targets;
}

function wantedValues(draft: RecordDraft): Item {
  return {
    ...draft.values,
    ...Object.fromEntries(
      Object.entries(draft.references ?? {}).map(([field, record]) => [
        field,
        record.id ?? record.key ?? null,
      ]),
    ),
  };
}

export function findDraftConflicts(
  snapshots: DraftSnapshot[],
): DraftConflict[] {
  for (const target of snapshots) {
    if (
      Object.keys(wantedValues(target.draft)).some(
        (field) =>
          Object.hasOwn(target.draft.baseValues!, field) &&
          !Object.hasOwn(target.current, field),
      )
    ) {
      throw new Error(
        "Доступ к одному из изменённых полей изменился. Черновик остался в этом окне.",
      );
    }
  }
  return snapshots.flatMap((target) =>
    Object.entries(wantedValues(target.draft))
      .filter(
        ([field, value]) =>
          Object.hasOwn(target.draft.baseValues!, field) &&
          Object.hasOwn(target.current, field) &&
          !equal(target.draft.baseValues![field], target.current[field]) &&
          !equal(value, target.current[field]),
      )
      .map(([field, mine]) => ({
        key: `${target.path}/${field}`,
        target,
        field,
        mine,
        current: target.current[field],
      })),
  );
}

export function rebaseDraft(
  collection: string,
  draft: RecordDraft,
  snapshots: DraftSnapshot[],
  choices: ConflictChoices,
  labelFor?: (collection: string, preview: Item) => string,
): RecordDraft {
  if (
    findDraftConflicts(snapshots).some((conflict) => !choices[conflict.key])
  ) {
    throw new Error("Выберите значение для каждого совпавшего поля.");
  }
  const current = new Map(
    snapshots.map((snapshot) => [snapshot.path, snapshot.current]),
  );
  return mapDraft(collection, draft, (target) => {
    const fresh = current.get(target.path);
    if (!fresh) {
      return target.draft;
    }
    const values = { ...target.draft.values };
    const references = { ...target.draft.references };
    for (const field of Object.keys(wantedValues(target.draft))) {
      if (choices[`${target.path}/${field}`] === "current") {
        delete values[field];
        delete references[field];
      } else if (
        Object.hasOwn(values, field) &&
        equal(values[field], fresh[field])
      ) {
        delete values[field];
      }
    }
    const next = { ...target.draft, values, references, baseValues: fresh };
    const preview = { ...fresh, ...wantedValues(next) };
    return {
      ...next,
      preview,
      ...(labelFor ? { label: labelFor(target.collection, preview) } : {}),
    };
  });
}
