import { defineCollection } from "@asmblyr/kit";

export default defineCollection({
  name: "entries",
  mode: "multiple",
  primaryKey: { name: "id", type: "uuid" },
  timestamps: { createdAt: true, updatedAt: true },
  presentation: {
    displayName: "Комментарии",
    hidden: true,
  },
  fields: {
    collection: {
      type: "text",
      required: true,
      nullable: false,
      searchable: false,
      presentation: {
        label: "Коллекция",
        description:
          "Техническое имя коллекции, к записи которой оставлен комментарий.",
        width: "half",
      },
    },
    item: {
      type: "text",
      required: true,
      nullable: false,
      searchable: false,
      presentation: {
        label: "Запись",
        description:
          "Первичный ключ записи в строковом виде: число, UUID или строка.",
        width: "half",
      },
    },
    body: {
      type: "text",
      required: true,
      nullable: false,
      searchable: true,
      presentation: {
        label: "Комментарий",
        interface: "textarea",
        placeholder: "Напишите комментарий…",
        width: "full",
      },
    },
    author_id: {
      type: "uuid",
      nullable: true,
      required: false,
      presentation: { label: "Автор" },
    },
    author_kind: {
      type: "text",
      nullable: true,
      required: false,
      searchable: false,
      presentation: { label: "Тип автора" },
    },
    author_name: {
      type: "text",
      nullable: true,
      required: false,
      searchable: false,
      presentation: { label: "Имя автора при отправке" },
    },
  },
});
