import assert from "node:assert/strict";
import test from "node:test";
import { describeFilter } from "../src/components/items/item-filter-description";
import type { FilterGroup } from "../src/components/items/item-filter-options";
import { normalizeStreamingMarkdown } from "../src/components/assistant/assistant-markdown-preview";
import {
  formatFilterDecimal,
  formatSelectionCount,
  formatSelectionDescription,
  normalizeFilterGroup,
} from "../src/components/assistant/assistant-filter-format";
import { filterHistoryConversations } from "../src/components/assistant/assistant-history-messages";
import {
  lastAssistantTurn,
  removeTrailingTurn,
  replaceTurnMessage,
} from "../src/components/assistant/assistant-turn-message";
import type { AssistantMessage } from "../src/components/assistant/assistant-types";

test("streaming markdown preview smooths partial headings, bold, code, and table dividers", () => {
  assert.equal(normalizeStreamingMarkdown("### "), "");
  assert.equal(
    normalizeStreamingMarkdown("## Доступные инструменты\n\n**Чтение"),
    "## Доступные инструменты\n\n**Чтение**",
  );
  assert.equal(
    normalizeStreamingMarkdown("Вызов `search_items"),
    "Вызов `search_items`",
  );
  assert.equal(
    normalizeStreamingMarkdown("| Название | Сумма |\n| --- | ---"),
    "| Название | Сумма |",
  );
  assert.equal(
    normalizeStreamingMarkdown('```json\n{"a": 1}'),
    '```json\n{"a": 1}\n```',
  );
});

test("replaceTurnMessage deduplicates when server ID and temporary ID both appear", () => {
  const messages: AssistantMessage[] = [
    { id: "u1", role: "user", content: "Привет" },
    { id: "tmp-1", role: "assistant", content: "Часть", streaming: true },
    { id: "db-1", role: "assistant", content: "Часть", streaming: true },
  ];
  const updated = replaceTurnMessage(
    messages,
    { id: "db-1", role: "assistant", content: "", cancelled: true },
    "tmp-1",
  );
  assert.equal(updated.length, 2);
  assert.equal(updated[1].id, "db-1");
  assert.equal(updated[1].cancelled, true);
});

test("lastAssistantTurn and removeTrailingTurn distinguish retryable and regeneratable turns", () => {
  const completed: AssistantMessage[] = [
    { id: "welcome", role: "assistant", content: "" },
    { id: "u1", role: "user", content: "Вопрос" },
    { id: "a1", role: "assistant", content: "Ответ" },
  ];
  assert.deepEqual(lastAssistantTurn(completed), {
    userId: "u1",
    assistantId: "a1",
    content: "Вопрос",
    incomplete: false,
  });

  const cancelled: AssistantMessage[] = [
    ...completed,
    { id: "u2", role: "user", content: "Повтор" },
    { id: "a2", role: "assistant", content: "", cancelled: true },
  ];
  const turn = lastAssistantTurn(cancelled);
  assert.deepEqual(turn, {
    userId: "u2",
    assistantId: "a2",
    content: "Повтор",
    incomplete: true,
  });
  assert.deepEqual(
    removeTrailingTurn(cancelled, turn!).map((message) => message.id),
    ["welcome", "u1", "a1"],
  );
});

test("filter formatting strips trailing decimal zeros and preserves readable labels", () => {
  assert.equal(formatFilterDecimal("5000000.0000000000"), "5000000");
  assert.equal(formatFilterDecimal("12.50000"), "12.5");
  assert.equal(formatFilterDecimal("-0.0000"), "0");
  assert.equal(formatFilterDecimal("7728168971"), "7728168971");
  assert.equal(formatFilterDecimal("negotiation"), "negotiation");

  const filter: FilterGroup = {
    logic: "and",
    children: [
      { field: "stage", op: "eq", value: "negotiation" },
      { field: "amount_rub", op: "gt", value: "5000000.0000000000" },
    ],
  };
  const normalized = normalizeFilterGroup(filter);
  const secondChild = filter.children[1];
  assert.ok(!("logic" in secondChild));
  assert.equal(secondChild.value, "5000000.0000000000");

  const labels = new Map([
    ["stage", "Стадия воронки"],
    ["amount_rub", "Сумма сделки (₽)"],
  ]);
  const choices = new Map([
    ["stage", [{ value: "negotiation", label: "Переговоры" }]],
  ]);
  assert.equal(
    describeFilter(normalized, labels, choices),
    "(Стадия воронки · равно · Переговоры И Сумма сделки (₽) · больше · 5000000)",
  );
});

test("selection card formatting avoids stray punctuation space and handles count metadata", () => {
  assert.equal(
    formatSelectionDescription(
      "Открыть таблицу с условиями этой подборки",
      null,
      null,
    ),
    "Открыть таблицу с условиями этой подборки.",
  );
  assert.equal(
    formatSelectionDescription(
      "Открыть таблицу с условиями этой подборки",
      "и поиском «Альфа»",
      "Количество указано на момент ответа.",
    ),
    "Открыть таблицу с условиями этой подборки и поиском «Альфа». Количество указано на момент ответа.",
  );
  assert.equal(formatSelectionCount({ count: "12" }, "en-US"), "12");
  assert.equal(
    formatSelectionCount({ count: null, total: 2500 }, "en-US"),
    "2,500",
  );
  assert.equal(formatSelectionCount({ count: null }, "ru-RU"), null);
});

test("history search filters conversations by title, preview, and normalized ё/е", () => {
  const sessions = [
    { id: "1", title: "Отчёт по сделкам" },
    { id: "2", title: "", preview: "Задачи Фёдоровой" },
    { id: "3", title: "Анализ клиентов" },
  ];
  assert.deepEqual(
    filterHistoryConversations(sessions, "отчет", "Новая сессия").map(
      (item) => item.id,
    ),
    ["1"],
  );
  assert.deepEqual(
    filterHistoryConversations(sessions, "федоровой", "Новая сессия").map(
      (item) => item.id,
    ),
    ["2"],
  );
  assert.deepEqual(
    filterHistoryConversations(sessions, "новая", "Новая сессия").map(
      (item) => item.id,
    ),
    ["2"],
  );
});
