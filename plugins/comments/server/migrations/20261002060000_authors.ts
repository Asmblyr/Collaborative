import { defineMigration } from "@asmblyr/kit";

export default defineMigration({
  operations: [
    {
      type: "addField",
      collection: "entries",
      name: "author_id",
      field: { type: "uuid", nullable: true, required: false, presentation: { label: "Автор" } },
    },
    {
      type: "addField",
      collection: "entries",
      name: "author_kind",
      field: {
        type: "text",
        nullable: true,
        required: false,
        searchable: false,
        presentation: { label: "Тип автора" },
      },
    },
    {
      type: "addField",
      collection: "entries",
      name: "author_name",
      field: {
        type: "text",
        nullable: true,
        required: false,
        searchable: false,
        presentation: { label: "Имя автора при отправке" },
      },
    },
    {
      type: "addIndex",
      collection: "entries",
      name: "record_created",
      fields: ["collection", "item", "created_at", "id"],
    },
  ],
});
