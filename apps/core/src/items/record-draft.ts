import type { Knex } from "knex";
import {
  AccessDeniedError,
  requireGrant,
  type Access,
} from "../permissions/access.js";
import { collectionSchema } from "./schema-repository.js";
import { createItem, getItem, updateItem } from "./service.js";
import { requireRelatedRead } from "./related.js";
import { fieldGranted, relationContext } from "./relation-context.js";
import { changeRelationItems } from "./relation-mutations.js";
import {
  getRelationLink,
  insertRelationLink,
  updateRelationLink,
} from "./relation-links.js";
import { parseRecordDraft, type RecordDraft } from "./record-draft-input.js";
import type { MutationContext } from "./events-repository.js";
import { ItemError } from "./validation.js";

export async function commitRecordDraft(
  database: Knex,
  collection: string,
  body: unknown,
  access: Access,
  mutation: MutationContext,
) {
  mutation = { ...mutation, access, expectedSnapshots: new Map() };
  const draft = parseRecordDraft(body);
  return database.transaction(async (transaction) => {
    async function resolveValues(
      name: string,
      input: RecordDraft,
      before: Record<string, unknown> | null,
    ) {
      const schema = await collectionSchema(transaction, name);
      const readable = before ? requireGrant(access, name, "read") : null;
      const values = { ...input.values };
      for (const [field, reference] of Object.entries(input.references ?? {})) {
        const definition = schema.fields.get(field);
        if (!definition?.relation)
          throw new ItemError("Unknown reference field", 400);
        if (readable && !fieldGranted(readable, field))
          throw new AccessDeniedError();
        const relatedId = await save(definition.relation.collection, reference);
        // Editing an existing related record alone does not require updating
        // the parent's FK. Changing that FK still goes through normal grants.
        if (!before || String(before[field]) !== relatedId)
          values[field] = relatedId;
        else delete values[field];
      }
      return values;
    }
    async function save(
      name: string,
      input: RecordDraft,
      forced: Record<string, unknown> = {},
    ): Promise<string> {
      const schema = await collectionSchema(transaction, name);
      const before = input.id
        ? await getItem(
            transaction,
            name,
            input.id,
            requireGrant(access, name, "read"),
            undefined,
            access,
          )
        : null;
      const values = await resolveValues(name, input, before);
      for (const field of Object.keys(forced)) {
        if (
          Object.hasOwn(input.values, field) ||
          Object.hasOwn(input.references ?? {}, field)
        ) {
          throw new ItemError("Parent relation is set automatically", 400);
        }
      }
      Object.assign(values, forced);
      await requireRelatedRead(transaction, name, values, access);
      let item = before;
      if (!input.id)
        item = await createItem(
          transaction,
          name,
          values,
          mutation,
          requireGrant(access, name, "create"),
        );
      else if (Object.keys(values).length)
        item = await updateItem(
          transaction,
          name,
          input.id,
          values,
          mutation,
          requireGrant(access, name, "update"),
          input.expectedValues,
        );
      const id = String(item![schema.settings.primaryKey.name]);

      for (const [field, changes] of Object.entries(input.relations ?? {})) {
        const address = { collection: name, id, field };
        const context = await relationContext(
          transaction,
          address,
          access,
          true,
        );
        if (changes.detach?.length)
          await changeRelationItems(
            transaction,
            address,
            { detach: changes.detach },
            access,
            mutation,
          );
        for (const entry of changes.attach ?? []) {
          if (entry.record !== undefined) {
            const values = await resolveValues(
              context.alias.through_collection,
              entry.record,
              null,
            );
            const link = await insertRelationLink(
              transaction,
              context,
              entry.id,
              values,
              access,
              mutation,
            );
            await finishLink(
              context.alias.through_collection,
              link.id,
              entry.record,
            );
          } else
            await changeRelationItems(
              transaction,
              address,
              { attach: [entry.id] },
              access,
              mutation,
            );
        }
        for (const entry of changes.create ?? []) {
          if (!context.abilities.create) throw new AccessDeniedError();
          if (context.alias.kind === "o2m" && entry.link !== undefined)
            throw new ItemError("O2M has no link attributes", 400);
          const targetId = await save(
            context.alias.related_collection,
            entry.record,
            context.alias.kind === "o2m"
              ? { [context.alias.through_field]: context.id }
              : {},
          );
          if (context.alias.kind === "m2m") {
            const linkDraft = entry.link ?? { values: {} };
            const link = await insertRelationLink(
              transaction,
              context,
              targetId,
              await resolveValues(
                context.alias.through_collection,
                linkDraft,
                null,
              ),
              access,
              mutation,
            );
            await finishLink(
              context.alias.through_collection,
              link.id,
              linkDraft,
            );
          }
        }
        for (const entry of changes.links ?? []) {
          const before = await getRelationLink(
            transaction,
            address,
            entry.id,
            access,
          );
          const values = await resolveValues(
            context.alias.through_collection,
            entry.record,
            before,
          );
          if (Object.keys(values).length)
            await updateRelationLink(
              transaction,
              address,
              entry.id,
              values,
              access,
              mutation,
              entry.record.expectedValues,
            );
          await finishLink(
            context.alias.through_collection,
            entry.id,
            entry.record,
          );
        }
      }
      for (const entry of input.records ?? [])
        await save(entry.collection, entry.record);
      return id;
    }
    async function finishLink(name: string, id: string, record: RecordDraft) {
      if (
        Object.keys(record.relations ?? {}).length ||
        record.records?.length
      ) {
        await save(name, { ...record, id, values: {}, references: {} });
      }
    }
    return { id: await save(collection, draft) };
  });
}
