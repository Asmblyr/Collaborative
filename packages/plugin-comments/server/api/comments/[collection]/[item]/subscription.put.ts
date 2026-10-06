import {
  defineHandler,
  EndpointError,
  useAsmblyr,
} from "@asmblyr-collaborative/kit";
import { readCommentTarget } from "../../../../schemas/comments.js";
import { CommentsService } from "../../../../services/comments.js";

export default defineHandler(async (event) => {
  const target = readCommentTarget(event);
  const input: unknown = await event.req.json().catch(() => null);
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).length !== 1 ||
    !("enabled" in input) ||
    typeof input.enabled !== "boolean"
  ) {
    throw new EndpointError(
      400,
      "INVALID_SUBSCRIPTION",
      "Expected boolean enabled",
    );
  }
  const comments = new CommentsService(useAsmblyr(event));
  await comments.follow(target, input.enabled);
  return { enabled: input.enabled };
});
