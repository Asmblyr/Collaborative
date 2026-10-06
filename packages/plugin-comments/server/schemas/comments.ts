import { EndpointError } from "@asmblyr-collaborative/kit";
import { getQuery, getRouterParam, type H3Event } from "h3";
import {
  COMMENT_MAX_LENGTH,
  supportsComments,
  type CommentInput,
  type CommentTarget,
} from "../../shared/comments.js";

export function readCommentTarget(event: H3Event): CommentTarget {
  const collection = getRouterParam(event, "collection", { decode: true });
  const item = getRouterParam(event, "item", { decode: true });
  const validCollection =
    typeof collection === "string" &&
    /^[a-z][a-z0-9_]{0,62}$/.test(collection) &&
    supportsComments(collection);
  const validItem =
    typeof item === "string" && item.trim().length > 0 && item.length <= 255;

  if (!validCollection || !validItem)
    throw new EndpointError(400, "INVALID_RECORD", "Некорректный адрес записи");
  return { collection, item };
}

export function readCommentId(event: H3Event): string {
  const id = getRouterParam(event, "id", { decode: true });
  if (!id)
    throw new EndpointError(400, "INVALID_COMMENT", "Не указан комментарий");
  return id;
}

export function readCommentPage(event: H3Event): number {
  const page = getQuery(event).page;
  if (page === undefined) return 1;
  if (typeof page !== "string" || !/^[1-9]\d{0,6}$/.test(page))
    throw new EndpointError(400, "INVALID_PAGE", "Некорректная страница");
  return Number(page);
}

function parseCommentInput(value: unknown): CommentInput {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new EndpointError(
      400,
      "INVALID_COMMENT",
      "Ожидается текст комментария",
    );

  const input = value as Record<string, unknown>;
  if (Object.keys(input).length !== 1 || typeof input.body !== "string")
    throw new EndpointError(
      400,
      "INVALID_COMMENT",
      "Ожидается только поле body с текстом",
    );

  const body = input.body.trim();
  if (!body || body.length > COMMENT_MAX_LENGTH)
    throw new EndpointError(
      400,
      "INVALID_COMMENT",
      "Комментарий должен содержать от 1 до 10 000 символов",
    );
  return { body };
}

export async function readCommentInput(event: H3Event): Promise<CommentInput> {
  let input: unknown;
  try {
    input = await event.req.json();
  } catch {
    throw new EndpointError(
      400,
      "INVALID_JSON",
      "Ожидается JSON с текстом комментария",
    );
  }
  return parseCommentInput(input);
}
