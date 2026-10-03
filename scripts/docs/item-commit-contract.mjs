const object = { type: "object", additionalProperties: true };
const id = { type: "string", minLength: 1, maxLength: 255 };
const draft = { $ref: "#/components/schemas/ItemCommitDraft" };
const list = (items) => ({ type: "array", maxItems: 100, items });
const entry = (properties, required = Object.keys(properties)) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required,
});

export const itemCommitSchemas = {
  ItemCommitDraft: {
    type: "object",
    additionalProperties: false,
    description:
      "Одна транзакция; до 100 операций, глубина до 5. Существующая запись требует read. Каждая запись и поле проверяются по личным правам.",
    properties: {
      id,
      values: { ...object, default: {} },
      expectedValues: {
        ...object,
        description:
          "Исходные значения всех обновляемых полей, включая изменяемые FK. Требуют read. Несовпадение с актуальным значением возвращает ITEM_CHANGED (409), если новое значение ещё не применено. Пропуск сохраняет прежнее безусловное поведение.",
      },
      references: { type: "object", additionalProperties: draft },
      records: list(entry({ collection: id, record: draft })),
      relations: {
        type: "object",
        additionalProperties: {
          $ref: "#/components/schemas/ItemCommitRelation",
        },
      },
    },
  },
  ItemCommitRelation: {
    type: "object",
    additionalProperties: false,
    properties: {
      attach: list(entry({ id, record: draft }, ["id"])),
      detach: list(id),
      create: list(entry({ record: draft, link: draft }, ["record"])),
      links: list(entry({ id, record: draft })),
    },
  },
};

export const itemCommitBody = draft;
