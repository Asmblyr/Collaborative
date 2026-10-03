import { presencePages } from "../../packages/contracts/src/presence.js";

const string = { type: "string" };
const entry = (properties) => ({
  type: "object",
  additionalProperties: false,
  properties,
  required: Object.keys(properties),
});
export const presenceBody = entry({
  clientId: {
    ...string,
    format: "uuid",
    description:
      "Случайный UUID одной открытой страницы; пользователь определяется только по Bearer-сессии.",
  },
  scope: {
    oneOf: [
      entry({ kind: { const: "page" }, page: { enum: presencePages } }),
      entry({ kind: { const: "collection" }, collection: string }),
      entry({
        kind: { const: "record" },
        collection: string,
        id: { ...string, minLength: 1, maxLength: 255 },
      }),
    ],
  },
});
export const presenceResult = entry({
  data: entry({
    total: {
      type: "integer",
      minimum: 0,
      description: "Количество разных пользователей, включая текущего.",
    },
    participants: {
      type: "array",
      maxItems: 50,
      items: entry({
        id: { ...string, format: "uuid" },
        displayName: string,
        pictureUrl: { type: ["string", "null"] },
        views: { type: "integer", minimum: 1 },
        self: { type: "boolean" },
      }),
    },
  }),
});
