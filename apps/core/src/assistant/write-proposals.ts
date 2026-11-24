import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import {
  assertWritableFields,
  requireGrant,
  type Access,
} from "../permissions/access.js";
import { assertRowWrite } from "../permissions/row-access.js";
import { mcpActionAccess } from "../plugins/action-access.js";
import { collectionSchema } from "../items/schema-repository.js";
import { getItem } from "../items/service.js";
import { changedFields } from "../items/events-repository.js";
import { ItemError, parseItem, parseItemId } from "../items/validation.js";
import type { MutationFactory } from "../items/mutation-context.js";
import { parseId } from "../policies/validation.js";
import { objectInput } from "../shared/input.js";
import { toolCollectionName } from "../tools/collection-data.js";
import { requireMcpCollection } from "../tools/collection-scope.js";
import { ToolArgumentError } from "../tools/errors.js";
import { executeWriteTool } from "../tools/write-tools.js";

const DEFAULT_PROPOSAL_TTL_MS = 20 * 60 * 1000;
const MAX_PENDING_PER_USER = 32;
const MAX_STORED_PROPOSALS = 2048;
const MAX_DIFF_STRING_CHARS = 500;

export interface AssistantWriteDiffEntry {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
}

export interface AssistantWriteProposalCard {
  type: "write_proposal";
  proposalId: string;
  collection: string;
  collectionDisplayName: string;
  operation: "create" | "update";
  recordId: string | null;
  summary: string;
  diff: AssistantWriteDiffEntry[];
  status: "pending" | "confirmed" | "rejected";
  expiresAt: string;
}

export interface WriteProposalConfirmResult {
  status: "confirmed";
  proposalId: string;
  recordId: string | null;
  collection: string;
}

export interface WriteProposalRejectResult {
  status: "rejected";
  proposalId: string;
}

interface StoredWriteProposal {
  id: string;
  ownerId: string;
  sessionId: string | null;
  collection: string;
  collectionId: string;
  collectionDisplayName: string;
  operation: "create" | "update";
  recordId: string | null;
  values: Record<string, unknown>;
  expectedValues: Record<string, unknown> | null;
  summary: string;
  diff: AssistantWriteDiffEntry[];
  status: "pending" | "confirmed" | "rejected";
  confirmedRecordId: string | null;
  createdAt: number;
  expiresAt: number;
  inFlight: boolean;
}

function serializeDiffValue(value: unknown): unknown {
  if (value === undefined || value === null) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") {
    return value.length > MAX_DIFF_STRING_CHARS
      ? `${value.slice(0, MAX_DIFF_STRING_CHARS)}…`
      : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  const encoded = JSON.stringify(value);
  if (encoded.length > MAX_DIFF_STRING_CHARS) {
    return `${encoded.slice(0, MAX_DIFF_STRING_CHARS)}…`;
  }
  return value;
}

export function parseProposeWriteInput(args: unknown): {
  collection: string;
  operation: "create" | "update";
  id: string | null;
  values: Record<string, unknown>;
  expectedValues: Record<string, unknown> | null;
  summary: string | null;
} {
  const body = objectInput(args, [
    "collection",
    "operation",
    "id",
    "values",
    "expectedValues",
    "summary",
  ]);
  if (typeof body.collection !== "string" || !body.collection.trim()) {
    throw new ToolArgumentError(
      "INVALID_ARGUMENTS",
      'Fix argument "collection": expected a technical collection name.',
      ["collection"],
      'Invalid argument "collection".',
    );
  }
  const collection = toolCollectionName(body.collection.trim());
  if (body.operation !== "create" && body.operation !== "update") {
    throw new ToolArgumentError(
      "INVALID_ARGUMENTS",
      'Fix argument "operation": expected "create" or "update".',
      ["operation"],
      'Invalid argument "operation".',
    );
  }
  const operation = body.operation;

  let id: string | null = null;
  if (body.id !== undefined && body.id !== null) {
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
    id = body.id.trim();
  }
  if (operation === "update" && !id) {
    throw new ToolArgumentError(
      "INVALID_ARGUMENTS",
      'Argument "id" is required when operation is "update".',
      ["id"],
      'Missing required argument "id".',
    );
  }
  if (operation === "create" && id !== null) {
    throw new ToolArgumentError(
      "INVALID_ARGUMENTS",
      'Argument "id" must be null when operation is "create".',
      ["id"],
      'Invalid argument "id" for create operation.',
    );
  }

  if (
    !body.values ||
    typeof body.values !== "object" ||
    Array.isArray(body.values)
  ) {
    throw new ToolArgumentError(
      "INVALID_ARGUMENTS",
      'Fix argument "values": expected an object with 1-50 field entries.',
      ["values"],
      'Invalid argument "values".',
    );
  }
  const values = body.values as Record<string, unknown>;
  const fieldCount = Object.keys(values).length;
  if (fieldCount < 1 || fieldCount > 50) {
    throw new ToolArgumentError(
      "INVALID_ARGUMENTS",
      'Fix argument "values": supply between 1 and 50 fields.',
      ["values"],
      'Invalid argument "values".',
    );
  }
  if (Buffer.byteLength(JSON.stringify(values)) > 32_000) {
    throw new ItemError("Write input too large", 400);
  }

  let expectedValues: Record<string, unknown> | null = null;
  if (body.expectedValues !== undefined && body.expectedValues !== null) {
    if (
      operation !== "update" ||
      typeof body.expectedValues !== "object" ||
      Array.isArray(body.expectedValues)
    ) {
      throw new ToolArgumentError(
        "INVALID_ARGUMENTS",
        'Fix argument "expectedValues": expected an object for "update" or null for "create".',
        ["expectedValues"],
        'Invalid argument "expectedValues".',
      );
    }
    expectedValues = body.expectedValues as Record<string, unknown>;
  }

  let summary: string | null = null;
  if (body.summary !== undefined && body.summary !== null) {
    if (
      typeof body.summary !== "string" ||
      body.summary.length > 300 ||
      body.summary.includes("\0")
    ) {
      throw new ToolArgumentError(
        "INVALID_ARGUMENTS",
        'Fix argument "summary": expected a string up to 300 characters or null.',
        ["summary"],
        'Invalid argument "summary".',
      );
    }
    const trimmed = body.summary.trim();
    summary = trimmed || null;
  }

  return { collection, operation, id, values, expectedValues, summary };
}

export class WriteProposalStore {
  private readonly proposals = new Map<string, StoredWriteProposal>();
  private readonly ttlMs: number;
  private readonly now: () => number;
  private readonly writeExecutor: typeof executeWriteTool;

  constructor(
    options: {
      ttlMs?: number;
      now?: () => number;
      executeWrite?: typeof executeWriteTool;
    } = {},
  ) {
    this.ttlMs = options.ttlMs ?? DEFAULT_PROPOSAL_TTL_MS;
    this.now = options.now ?? Date.now;
    this.writeExecutor = options.executeWrite ?? executeWriteTool;
  }

  private pruneExpired(): void {
    const currentTime = this.now();
    for (const [id, entry] of this.proposals) {
      if (entry.expiresAt <= currentTime && !entry.inFlight) {
        this.proposals.delete(id);
      }
    }
  }

  private saveProposal(proposal: StoredWriteProposal): void {
    this.pruneExpired();
    let userPending = 0;
    for (const entry of this.proposals.values()) {
      if (entry.ownerId === proposal.ownerId && entry.status === "pending") {
        userPending++;
      }
    }
    if (userPending >= MAX_PENDING_PER_USER) {
      throw new ItemError(
        "Слишком много неподтверждённых предложений. Подтвердите или отклоните предыдущие.",
        429,
      );
    }
    while (this.proposals.size >= MAX_STORED_PROPOSALS) {
      const oldest = this.proposals.keys().next().value;
      if (oldest === undefined) break;
      this.proposals.delete(oldest);
    }
    this.proposals.set(proposal.id, proposal);
  }

  /** Used in unit tests and internal inspection; never exposed to unauthenticated callers. */
  getForOwner(
    ownerId: string,
    proposalId: string,
  ): AssistantWriteProposalCard | null {
    const stored = this.proposals.get(proposalId);
    if (!stored || stored.ownerId !== ownerId) return null;
    if (stored.expiresAt <= this.now() && stored.status === "pending") {
      this.proposals.delete(proposalId);
      return null;
    }
    return this.toCard(stored);
  }

  private toCard(stored: StoredWriteProposal): AssistantWriteProposalCard {
    return {
      type: "write_proposal",
      proposalId: stored.id,
      collection: stored.collection,
      collectionDisplayName: stored.collectionDisplayName,
      operation: stored.operation,
      recordId: stored.recordId,
      summary: stored.summary,
      diff: stored.diff,
      status: stored.status,
      expiresAt: new Date(stored.expiresAt).toISOString(),
    };
  }

  async propose(
    db: Knex,
    access: Access,
    sessionId: string | null,
    args: unknown,
    signal?: AbortSignal,
  ): Promise<{ card: AssistantWriteProposalCard; toolResult: object }> {
    const input = parseProposeWriteInput(args);
    signal?.throwIfAborted();

    const validated = await db.transaction(
      async (trx) => {
        const schema = await collectionSchema(trx, input.collection);
        requireMcpCollection(schema.settings);
        const effective = await mcpActionAccess(trx, access);
        const writeGrant = requireGrant(
          effective,
          input.collection,
          input.operation,
        );
        const allowedKeys = [
          ...schema.fields.keys(),
          schema.settings.primaryKey.name,
        ];
        const values = objectInput(input.values, allowedKeys);
        const manualKey =
          input.operation === "create" &&
          schema.settings.primaryKey.type === "text"
            ? schema.settings.primaryKey.name
            : undefined;
        assertWritableFields(values, writeGrant, manualKey);
        const parsedValues = parseItem(
          values,
          schema.fields,
          input.operation === "create",
          manualKey,
        );
        for (const field of Object.keys(values)) {
          const relation = schema.fields.get(field)?.relation;
          if (
            relation &&
            values[field] !== null &&
            !relation.collection.startsWith("@")
          ) {
            requireMcpCollection(
              (await collectionSchema(trx, relation.collection)).settings,
            );
            requireGrant(effective, relation.collection, "read");
          }
        }

        const collectionDisplayName =
          schema.settings.displayName || input.collection;
        const fieldLabel = (field: string) =>
          schema.fields.get(field)?.presentation?.label?.trim() || field;

        if (input.operation === "create") {
          const diff: AssistantWriteDiffEntry[] = Object.keys(values).map(
            (field) => ({
              field,
              label: fieldLabel(field),
              before: null,
              after: serializeDiffValue(parsedValues[field]),
            }),
          );
          return {
            collectionId: schema.settings.internalId,
            collectionDisplayName,
            recordId: null as string | null,
            values,
            expectedValues: null as Record<string, unknown> | null,
            diff,
          };
        }

        const recordId = parseItemId(
          input.id!,
          schema.settings.primaryKey.type,
        );
        await assertRowWrite(
          trx,
          effective,
          input.collection,
          "update",
          schema.settings.primaryKey.name,
          recordId,
          Object.keys(values),
        );
        const before = await getItem(
          trx,
          input.collection,
          recordId,
          requireGrant(effective, input.collection, "read"),
          Object.keys(values).join(","),
          effective,
        );
        const expectedValues = Object.fromEntries(
          Object.keys(values).map((field) => {
            if (!Object.hasOwn(before, field)) {
              throw new ItemError("Field is not readable", 403);
            }
            return [field, before[field]];
          }),
        );
        if (input.expectedValues) {
          const supplied = objectInput(
            input.expectedValues,
            Object.keys(values),
          );
          const mismatch = changedFields(supplied, {
            ...supplied,
            ...Object.fromEntries(
              Object.keys(supplied).map((field) => [field, before[field]]),
            ),
          }).after;
          if (Object.keys(mismatch).length > 0) {
            throw new ItemError(
              "Запись изменилась. Проверьте актуальные значения перед подтверждением.",
              409,
              "ITEM_CHANGED",
            );
          }
        }
        if (Buffer.byteLength(JSON.stringify(expectedValues)) > 16_000) {
          throw new ItemError("Original values too large", 400);
        }
        const diff: AssistantWriteDiffEntry[] = Object.keys(values).map(
          (field) => ({
            field,
            label: fieldLabel(field),
            before: serializeDiffValue(before[field]),
            after: serializeDiffValue(parsedValues[field]),
          }),
        );
        return {
          collectionId: schema.settings.internalId,
          collectionDisplayName,
          recordId,
          values,
          expectedValues,
          diff,
        };
      },
      { readOnly: true },
    );

    signal?.throwIfAborted();
    const createdAt = this.now();
    const expiresAt = createdAt + this.ttlMs;
    const id = randomUUID();
    const defaultSummary =
      input.operation === "create"
        ? `Создание записи в «${validated.collectionDisplayName}»`
        : `Обновление записи ${validated.recordId} в «${validated.collectionDisplayName}»`;
    const stored: StoredWriteProposal = {
      id,
      ownerId: access.principal.id,
      sessionId,
      collection: input.collection,
      collectionId: validated.collectionId,
      collectionDisplayName: validated.collectionDisplayName,
      operation: input.operation,
      recordId: validated.recordId,
      values: validated.values,
      expectedValues: validated.expectedValues,
      summary: input.summary ?? defaultSummary,
      diff: validated.diff,
      status: "pending",
      confirmedRecordId: null,
      createdAt,
      expiresAt,
      inFlight: false,
    };
    this.saveProposal(stored);
    const card = this.toCard(stored);
    return {
      card,
      toolResult: {
        proposed: true,
        requiresUserClick: true,
        proposalId: card.proposalId,
        collection: card.collection,
        collectionDisplayName: card.collectionDisplayName,
        operation: card.operation,
        recordId: card.recordId,
        summary: card.summary,
        diff: card.diff,
        expiresAt: card.expiresAt,
      },
    };
  }

  async confirm(
    db: Knex,
    access: Access,
    proposalIdInput: string,
    mutations?: MutationFactory,
    signal?: AbortSignal,
  ): Promise<WriteProposalConfirmResult> {
    const proposalId = parseId(proposalIdInput);
    const stored = this.proposals.get(proposalId);
    if (!stored || stored.ownerId !== access.principal.id) {
      throw new ItemError(
        "Предложение изменения не найдено или недоступно.",
        404,
        "PROPOSAL_NOT_FOUND",
      );
    }
    if (stored.status === "confirmed") {
      return {
        status: "confirmed",
        proposalId: stored.id,
        recordId: stored.confirmedRecordId,
        collection: stored.collection,
      };
    }
    if (stored.status === "rejected") {
      throw new ItemError(
        "Предложение изменения уже отклонено.",
        409,
        "PROPOSAL_REJECTED",
      );
    }
    if (stored.expiresAt <= this.now()) {
      this.proposals.delete(proposalId);
      throw new ItemError(
        "Срок действия предложения истёк. Запросите новое подтверждение.",
        409,
        "PROPOSAL_EXPIRED",
      );
    }
    if (stored.inFlight) {
      throw new ItemError(
        "Изменение уже выполняется.",
        409,
        "PROPOSAL_IN_PROGRESS",
      );
    }
    stored.inFlight = true;
    try {
      const toolName =
        stored.operation === "create" ? "create_item" : "update_item";
      const result = (await this.writeExecutor(
        db,
        access,
        stored.collection,
        stored.collectionId,
        toolName,
        {
          ...(stored.recordId !== null ? { id: stored.recordId } : {}),
          values: stored.values,
          ...(stored.expectedValues !== null
            ? { expectedValues: stored.expectedValues }
            : {}),
          operationId: `proposal_${stored.id.replace(/-/g, "")}`,
        },
        { source: "assistant", mutations },
        signal,
      )) as { id?: string | null };
      const recordId =
        typeof result.id === "string" ? result.id : stored.recordId;
      stored.status = "confirmed";
      stored.confirmedRecordId = recordId;
      return {
        status: "confirmed",
        proposalId: stored.id,
        recordId,
        collection: stored.collection,
      };
    } finally {
      stored.inFlight = false;
    }
  }

  reject(access: Access, proposalIdInput: string): WriteProposalRejectResult {
    const proposalId = parseId(proposalIdInput);
    const stored = this.proposals.get(proposalId);
    if (!stored || stored.ownerId !== access.principal.id) {
      throw new ItemError(
        "Предложение изменения не найдено или недоступно.",
        404,
        "PROPOSAL_NOT_FOUND",
      );
    }
    if (stored.status === "confirmed") {
      throw new ItemError(
        "Предложение изменения уже подтверждено.",
        409,
        "PROPOSAL_CONFIRMED",
      );
    }
    stored.status = "rejected";
    return {
      status: "rejected",
      proposalId: stored.id,
    };
  }
}
