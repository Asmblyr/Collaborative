import type { Knex } from "knex";
import { grantFor, requireGrant, type Access } from "../permissions/access.js";
import {
  applyRowAccess,
  projectRow,
  selectRowPermissions,
} from "../permissions/row-access.js";
import { mcpActionAccess } from "../plugins/action-access.js";
import { collectionSchema } from "../items/schema-repository.js";
import { resolveRecordLabels } from "../items/record-labels.js";
import { ItemError, parseItemId } from "../items/validation.js";
import { objectInput } from "../shared/input.js";
import {
  collectionData,
  toolCollectionName,
} from "../tools/collection-data.js";
import { requireMcpCollection } from "../tools/collection-scope.js";
import { ToolArgumentError } from "../tools/errors.js";

const MAX_RECORD_SUMMARY_FIELDS = 4;
const MAX_FIELD_PREVIEW_CHARS = 160;
const MAX_FORM_VALUES_BYTES = 16_000;

export interface AssistantRecordCardField {
  field: string;
  label: string;
  value: string | null;
}

export interface AssistantRecordCard {
  type: "record";
  collection: string;
  collectionId: string;
  collectionDisplayName: string;
  recordId: string;
  title: string;
  summary: string | null;
  fields: AssistantRecordCardField[];
}

export interface AssistantFormCardField {
  field: string;
  label: string;
  value: unknown;
}

export interface AssistantFormCard {
  type: "form";
  collection: string;
  collectionId: string;
  collectionDisplayName: string;
  summary: string | null;
  values: Record<string, unknown>;
  fields: AssistantFormCardField[];
}

function parseOptionalSummary(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length > 300 || value.includes("\0")) {
    throw new ToolArgumentError(
      "INVALID_ARGUMENTS",
      'Fix argument "summary": expected a string up to 300 characters or null.',
      ["summary"],
      'Invalid argument "summary".',
    );
  }
  const trimmed = value.trim();
  return trimmed || null;
}

function formatFieldPreview(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const text =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "string"
        ? value
        : typeof value === "number" || typeof value === "boolean"
          ? String(value)
          : JSON.stringify(value);
  return text.length > MAX_FIELD_PREVIEW_CHARS
    ? `${text.slice(0, MAX_FIELD_PREVIEW_CHARS)}…`
    : text;
}

export function selectRecordSummaryFields(
  schemaFields: Map<
    string,
    {
      name: string;
      type: string | null;
      presentation?: { label?: string | null } | null;
    }
  >,
  projectedRow: Record<string, unknown>,
  primaryKey: string,
  title: string,
): AssistantRecordCardField[] {
  const candidates: {
    field: string;
    label: string;
    value: string | null;
    priority: number;
  }[] = [];

  for (const [fieldName, meta] of schemaFields) {
    if (fieldName === primaryKey) continue;
    if (!Object.hasOwn(projectedRow, fieldName)) continue;
    const formatted = formatFieldPreview(projectedRow[fieldName]);
    const label = meta.presentation?.label?.trim() || fieldName;
    const isJson = meta.type === "json";
    const duplicatesTitle = formatted !== null && formatted === title;
    const priority =
      (formatted !== null ? 0 : 10) +
      (isJson ? 4 : 0) +
      (duplicatesTitle ? 2 : 0);
    candidates.push({ field: fieldName, label, value: formatted, priority });
  }

  return candidates
    .sort((a, b) => a.priority - b.priority)
    .slice(0, MAX_RECORD_SUMMARY_FIELDS)
    .map(({ field, label, value }) => ({ field, label, value }));
}

export async function buildRecordCard(
  db: Knex,
  access: Access,
  args: unknown,
  signal?: AbortSignal,
): Promise<{ card: AssistantRecordCard; toolResult: object }> {
  const body = objectInput(args, ["collection", "id", "summary"]);
  if (typeof body.collection !== "string" || !body.collection.trim()) {
    throw new ToolArgumentError(
      "INVALID_ARGUMENTS",
      'Fix argument "collection": expected a technical collection name.',
      ["collection"],
      'Invalid argument "collection".',
    );
  }
  const collection = toolCollectionName(body.collection.trim());
  if (
    typeof body.id !== "string" ||
    !body.id.trim() ||
    body.id.length > 255 ||
    body.id.includes("\0")
  ) {
    throw new ToolArgumentError(
      "INVALID_ARGUMENTS",
      'Fix argument "id": expected a non-empty record ID string up to 255 characters.',
      ["id"],
      'Invalid argument "id".',
    );
  }
  const summary = parseOptionalSummary(body.summary);
  signal?.throwIfAborted();

  const card = await db.transaction(
    async (trx) => {
      const data = await collectionData(trx, access, collection);
      const key = data.schema.settings.primaryKey;
      const recordId = parseItemId(body.id as string, key.type);
      const readablePhysical = [...data.schema.fields.keys()].filter(
        (field) => data.allowed.includes("*") || data.allowed.includes(field),
      );
      const selected = [key.name, ...readablePhysical.slice(0, 24)];
      const columns = selected.map((field) =>
        trx.raw("left(??::text, ?) as ??", [
          field,
          MAX_FIELD_PREVIEW_CHARS + 1,
          field,
        ]),
      );
      const rawRow = await trx(collection)
        .withSchema("public")
        .where(key.name, recordId)
        .select(columns)
        .modify((query) => {
          applyRowAccess(query, trx, access, collection);
          selectRowPermissions(query, trx, access, collection);
        })
        .first();
      signal?.throwIfAborted();
      if (!rawRow) {
        throw new ItemError("Item not found", 404);
      }
      const projected = projectRow(rawRow, access, collection, key.name);
      const labels = await resolveRecordLabels(
        trx,
        collection,
        [recordId],
        access,
        data.catalog,
      );
      signal?.throwIfAborted();
      const title = labels[recordId] || recordId;
      const fields = selectRecordSummaryFields(
        data.schema.fields,
        projected,
        key.name,
        title,
      );
      return {
        type: "record" as const,
        collection,
        collectionId: data.schema.settings.internalId,
        collectionDisplayName: data.schema.settings.displayName || collection,
        recordId,
        title,
        summary,
        fields,
      };
    },
    { readOnly: true },
  );

  return {
    card,
    toolResult: {
      presented: true,
      requiresUserClick: true,
      collection: card.collection,
      recordId: card.recordId,
      title: card.title,
      fields: card.fields,
    },
  };
}

export async function buildFormCard(
  db: Knex,
  access: Access,
  args: unknown,
  signal?: AbortSignal,
): Promise<{ card: AssistantFormCard; toolResult: object }> {
  const body = objectInput(args, ["collection", "values", "summary"]);
  if (typeof body.collection !== "string" || !body.collection.trim()) {
    throw new ToolArgumentError(
      "INVALID_ARGUMENTS",
      'Fix argument "collection": expected a technical collection name.',
      ["collection"],
      'Invalid argument "collection".',
    );
  }
  const collection = toolCollectionName(body.collection.trim());
  const summary = parseOptionalSummary(body.summary);

  let rawValues: Record<string, unknown> = {};
  if (body.values !== undefined && body.values !== null) {
    if (typeof body.values !== "object" || Array.isArray(body.values)) {
      throw new ToolArgumentError(
        "INVALID_ARGUMENTS",
        'Fix argument "values": expected an object of prefilled field values or null.',
        ["values"],
        'Invalid argument "values".',
      );
    }
    rawValues = body.values as Record<string, unknown>;
    if (Object.keys(rawValues).length > 50) {
      throw new ToolArgumentError(
        "INVALID_ARGUMENTS",
        'Fix argument "values": supply at most 50 prefilled fields.',
        ["values"],
        'Invalid argument "values".',
      );
    }
  }
  signal?.throwIfAborted();

  const { card, strippedFields } = await db.transaction(
    async (trx) => {
      const schema = await collectionSchema(trx, collection);
      requireMcpCollection(schema.settings);
      const effective = await mcpActionAccess(trx, access);
      const createGrant = requireGrant(effective, collection, "create");
      const manualKey =
        schema.settings.primaryKey.type === "text"
          ? schema.settings.primaryKey.name
          : undefined;

      const filteredValues: Record<string, unknown> = {};
      const fields: AssistantFormCardField[] = [];
      const stripped: string[] = [];

      for (const [fieldName, fieldValue] of Object.entries(rawValues)) {
        const isManualKey = fieldName === manualKey;
        const fieldMeta = schema.fields.get(fieldName);
        if (!isManualKey && !fieldMeta) {
          stripped.push(fieldName);
          continue;
        }
        const writable =
          isManualKey ||
          createGrant.includes("*") ||
          createGrant.includes(fieldName);
        if (!writable) {
          stripped.push(fieldName);
          continue;
        }
        if (
          fieldMeta?.relation &&
          fieldValue !== null &&
          !fieldMeta.relation.collection.startsWith("@")
        ) {
          const targetCollection = fieldMeta.relation.collection;
          try {
            const targetSchema = await collectionSchema(trx, targetCollection);
            if (
              targetSchema.settings.mcp?.enabled === false ||
              grantFor(effective, targetCollection, "read") === null
            ) {
              stripped.push(fieldName);
              continue;
            }
          } catch {
            stripped.push(fieldName);
            continue;
          }
        }
        filteredValues[fieldName] = fieldValue;
        fields.push({
          field: fieldName,
          label: fieldMeta?.presentation?.label?.trim() || fieldName,
          value: fieldValue,
        });
      }

      if (
        Buffer.byteLength(JSON.stringify(filteredValues)) >
        MAX_FORM_VALUES_BYTES
      ) {
        throw new ItemError("Prefilled form values too large", 400);
      }

      return {
        card: {
          type: "form" as const,
          collection,
          collectionId: schema.settings.internalId,
          collectionDisplayName: schema.settings.displayName || collection,
          summary,
          values: filteredValues,
          fields,
        },
        strippedFields: stripped,
      };
    },
    { readOnly: true },
  );

  return {
    card,
    toolResult: {
      presented: true,
      requiresUserClick: true,
      collection: card.collection,
      collectionDisplayName: card.collectionDisplayName,
      prefilledFields: Object.keys(card.values),
      ...(strippedFields.length ? { strippedFields } : {}),
    },
  };
}
