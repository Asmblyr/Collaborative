const object = (properties) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
const string = { type: "string" };
const uuid = { type: "string", format: "uuid" };
const timestamp = { type: "string", format: "date-time" };
const nullableString = { type: ["string", "null"] };
const notification = object({
  id: uuid,
  source: string,
  panelId: string,
  targetId: string,
  collection: string,
  collectionDisplayName: nullableString,
  item: string,
  actorName: nullableString,
  preview: { type: "string", maxLength: 300 },
  createdAt: timestamp,
  readAt: { type: ["string", "null"], format: "date-time" },
});
const noContent = { description: "Прочитано" };
export function notificationsContract(key) {
  if (key === "GET /notifications")
    return {
      parameters: [
        {
          name: "limit",
          in: "query",
          schema: { type: "integer", minimum: 1, maximum: 200, default: 50 },
        },
      ],
      responses: {
        200: {
          description:
            "Последние доступные уведомления; до 200 на пользователя",
          content: {
            "application/json": {
              schema: object({
                data: { type: "array", items: notification },
                unread: { type: "integer", minimum: 0 },
                total: { type: "integer", minimum: 0 },
                readBefore: timestamp,
              }),
            },
          },
        },
      },
    };
  if (key === "POST /notifications/:id/read")
    return {
      parameters: [{ name: "id", in: "path", required: true, schema: uuid }],
      responses: {
        204: noContent,
        404: {
          description: "Уведомление чужое, отсутствует или запись недоступна",
        },
      },
    };
  if (key === "POST /notifications/read-all")
    return {
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: object({
              before: {
                ...timestamp,
                description:
                  "readBefore из ответа списка; будущие даты запрещены",
              },
            }),
          },
        },
      },
      responses: {
        204: noContent,
        400: { description: "Некорректная граница снимка" },
      },
    };
}
