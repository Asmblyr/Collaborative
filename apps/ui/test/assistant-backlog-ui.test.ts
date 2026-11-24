import assert from "node:assert/strict";
import test from "node:test";
import { translateCopy } from "@asmblyr-collaborative/contracts/translations";
import type { UiCopy } from "../src/lib/ui-copy-types";
import { HttpError } from "../src/lib/http-request";
import {
  beginWriteProposalAction,
  completeWriteProposalConfirm,
  completeWriteProposalReject,
  failWriteProposalAction,
  formatProposalValue,
  initialWriteProposalState,
} from "../src/components/assistant/assistant-write-proposal-state";
import {
  ASSISTANT_FORM_PREFILL_KEY,
  consumeFormPrefill,
  FORM_PREFILL_TTL_MS,
  formCardHref,
  isOnCollectionListPath,
  normalizeFormPrefillValues,
  recordCardHref,
  stageFormPrefill,
} from "../src/components/assistant/assistant-form-handoff";
import {
  applyConversationRename,
  MAX_CONVERSATION_TITLE_LENGTH,
  restoreAssistantMessages,
  validateConversationTitle,
} from "../src/components/assistant/assistant-history-messages";
import { readAssistantEvents } from "../src/components/assistant/assistant-stream";
import type { AssistantAnswerPayload } from "../src/components/assistant/assistant-types";

const enCopy: UiCopy = (source, values) => translateCopy(source, "en", values);

function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return {
    get length() {
      return map.size;
    },
    clear() {
      map.clear();
    },
    getItem(key: string) {
      return map.get(key) ?? null;
    },
    key(index: number) {
      return [...map.keys()][index] ?? null;
    },
    removeItem(key: string) {
      map.delete(key);
    },
    setItem(key: string, value: string) {
      map.set(key, value);
    },
  };
}

test("write proposal formatting strips trailing decimal zeros and formats primitives", () => {
  assert.equal(formatProposalValue("5000000.0000000000"), "5000000");
  assert.equal(formatProposalValue("12.50000"), "12.5");
  assert.equal(formatProposalValue("-0.0000"), "0");
  assert.equal(formatProposalValue(42), "42");
  assert.equal(formatProposalValue(true), "Да");
  assert.equal(formatProposalValue(false), "Нет");
  assert.equal(formatProposalValue(true, enCopy), "Yes");
  assert.equal(formatProposalValue(false, enCopy), "No");
  assert.equal(formatProposalValue(null), "—");
  assert.equal(formatProposalValue(""), "—");
  assert.equal(formatProposalValue(["a", "10.0000"]), "a, 10");
  assert.equal(formatProposalValue({ a: 1 }), '{"a":1}');
});

test("write proposal state handles confirm, reject, and terminal error codes cleanly", () => {
  const initial = initialWriteProposalState({
    status: "pending",
    recordId: null,
  });
  const confirming = beginWriteProposalAction(initial, "confirm");
  assert.equal(confirming.status, "confirming");

  const confirmed = completeWriteProposalConfirm(confirming, {
    recordId: "rec-42",
  });
  assert.equal(confirmed.status, "confirmed");
  assert.equal(confirmed.recordId, "rec-42");
  assert.equal(confirmed.error, null);
  // Terminal states ignore further transitions.
  assert.equal(beginWriteProposalAction(confirmed, "reject"), confirmed);

  const rejecting = beginWriteProposalAction(initial, "reject");
  assert.equal(rejecting.status, "rejecting");
  const rejected = completeWriteProposalReject(rejecting);
  assert.equal(rejected.status, "rejected");

  const itemChanged = failWriteProposalAction(
    confirming,
    new HttpError("Conflict", 409, "ITEM_CHANGED"),
  );
  assert.equal(itemChanged.status, "pending");
  assert.equal(itemChanged.errorCode, "ITEM_CHANGED");
  assert.match(itemChanged.error ?? "", /изменена другим пользователем/i);

  const expired = failWriteProposalAction(
    confirming,
    new HttpError("Expired", 409, "PROPOSAL_EXPIRED"),
    enCopy,
  );
  assert.equal(expired.status, "pending");
  assert.equal(expired.errorCode, "PROPOSAL_EXPIRED");
  assert.match(expired.error ?? "", /expired/i);

  const alreadyRejected = failWriteProposalAction(
    confirming,
    new HttpError("Rejected", 409, "PROPOSAL_REJECTED"),
  );
  assert.equal(alreadyRejected.status, "rejected");

  const alreadyConfirmed = failWriteProposalAction(
    rejecting,
    new HttpError("Confirmed", 409, "PROPOSAL_CONFIRMED"),
  );
  assert.equal(alreadyConfirmed.status, "confirmed");

  const forbidden = failWriteProposalAction(
    confirming,
    new HttpError("Forbidden", 403, "PERMISSION_DENIED"),
    enCopy,
  );
  assert.equal(forbidden.status, "pending");
  assert.match(forbidden.error ?? "", /permission/i);
});

test("record and form handoff helpers build routes and manage prefill lifecycle", () => {
  assert.equal(recordCardHref("tasks", "id/1"), "/items/tasks/id%2F1");
  assert.equal(
    recordCardHref("tasks", "42", (href) => `${href}?workspace=ws-1`),
    "/items/tasks/42?workspace=ws-1",
  );
  assert.equal(
    formCardHref("deals", (href) => `${href}?workspace=ws-2`),
    "/items/deals?workspace=ws-2",
  );
  assert.equal(isOnCollectionListPath("/items/tasks", "tasks"), true);
  assert.equal(isOnCollectionListPath("/items/tasks/42", "tasks"), false);

  const storage = memoryStorage();
  const baseTime = 1_700_000_000_000;
  assert.equal(
    stageFormPrefill(
      "tasks",
      {
        title: "Подготовить отчёт",
        priority: "high",
        ignored: undefined,
      },
      storage,
      baseTime,
    ),
    true,
  );

  // Reading for a different collection does not consume the staged payload.
  assert.equal(consumeFormPrefill("deals", storage, baseTime + 1000), null);
  assert.notEqual(storage.getItem(ASSISTANT_FORM_PREFILL_KEY), null);

  // Reading for the target collection consumes and clears the payload.
  assert.deepEqual(consumeFormPrefill("tasks", storage, baseTime + 2000), {
    title: "Подготовить отчёт",
    priority: "high",
  });
  assert.equal(storage.getItem(ASSISTANT_FORM_PREFILL_KEY), null);

  // Expired payloads are discarded.
  stageFormPrefill("tasks", { title: "Старая форма" }, storage, baseTime);
  assert.equal(
    consumeFormPrefill("tasks", storage, baseTime + FORM_PREFILL_TTL_MS + 1),
    null,
  );
  assert.equal(storage.getItem(ASSISTANT_FORM_PREFILL_KEY), null);

  // Prototype pollution keys are stripped.
  const sanitized = normalizeFormPrefillValues(
    JSON.parse('{"__proto__":{"polluted":true},"title":"OK"}'),
  );
  assert.deepEqual(sanitized, { title: "OK" });
});

test("session rename validation enforces 1..120 trimmed chars and updates list", () => {
  assert.deepEqual(validateConversationTitle("   "), {
    ok: false,
    reason: "empty",
  });
  assert.deepEqual(validateConversationTitle("a\0b"), {
    ok: false,
    reason: "invalid_char",
  });
  assert.deepEqual(
    validateConversationTitle("x".repeat(MAX_CONVERSATION_TITLE_LENGTH + 1)),
    { ok: false, reason: "too_long" },
  );
  assert.deepEqual(validateConversationTitle("  Сделки Q4  "), {
    ok: true,
    title: "Сделки Q4",
  });

  const sessions = [
    { id: "s1", title: "Старое", updatedAt: "2026-10-01T10:00:00Z" },
    { id: "s2", title: "Другое", updatedAt: "2026-10-01T11:00:00Z" },
  ];
  const updated = applyConversationRename(sessions, {
    id: "s1",
    title: "Новое название",
    updatedAt: "2026-10-01T12:00:00Z",
  });
  assert.equal(updated[0].title, "Новое название");
  assert.equal(updated[0].updatedAt, "2026-10-01T12:00:00Z");
  assert.equal(updated[1].title, "Другое");
});

test("NDJSON stream preserves writeProposals, records, and forms on answer payload", async () => {
  const answerEvent = {
    type: "answer",
    data: {
      content: "Готово",
      truncated: false,
      summary: {
        modelCalls: 1,
        toolCalls: 1,
        inputTokens: 10,
        outputTokens: 5,
      },
      writeProposals: [
        {
          type: "write_proposal",
          proposalId: "prop-1",
          collection: "tasks",
          collectionDisplayName: "Задачи",
          operation: "create",
          recordId: null,
          summary: "Создать задачу",
          diff: [
            { field: "title", label: "Название", before: null, after: "Тест" },
          ],
          status: "pending",
          expiresAt: "2026-11-24T13:00:00Z",
        },
      ],
      records: [
        {
          type: "record",
          collection: "tasks",
          collectionId: "col-1",
          collectionDisplayName: "Задачи",
          recordId: "task-1",
          title: "Тестовая задача",
          summary: "Сводка",
          fields: [{ field: "status", label: "Статус", value: "open" }],
        },
      ],
      forms: [
        {
          type: "form",
          collection: "tasks",
          collectionId: "col-1",
          collectionDisplayName: "Задачи",
          summary: "Черновик",
          values: { title: "Новая задача" },
          fields: [
            { field: "title", label: "Название", value: "Новая задача" },
          ],
        },
      ],
    },
  };
  const response = new Response(`${JSON.stringify(answerEvent)}\n`, {
    status: 200,
    headers: { "content-type": "application/x-ndjson" },
  });
  const events = [];
  for await (const event of readAssistantEvents(response)) {
    events.push(event);
  }
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "answer");
  const data = events[0].data as AssistantAnswerPayload;
  assert.equal(data.writeProposals?.[0]?.proposalId, "prop-1");
  assert.equal(data.records?.[0]?.recordId, "task-1");
  assert.deepEqual(data.forms?.[0]?.values, { title: "Новая задача" });

  // Restored history keeps ephemeral cards undefined.
  const restored = restoreAssistantMessages([
    {
      id: "m1",
      role: "assistant",
      content: "Готово",
      status: "completed",
      createdAt: "2026-11-24T12:00:00Z",
      contextScope: "chat",
      contextLabel: "",
      truncated: false,
      summary: null,
    },
  ]);
  assert.equal(restored[0].writeProposals, undefined);
  assert.equal(restored[0].records, undefined);
  assert.equal(restored[0].forms, undefined);
});
