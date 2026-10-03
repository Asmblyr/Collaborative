import { defineHandler, useAsmblyr } from "@asmblyr/kit";
import { readCommentInput, readCommentTarget } from "../../../../schemas/comments.js";
import { CommentsService } from "../../../../services/comments.js";

export default defineHandler(async (event) => {
  const target = readCommentTarget(event);
  const input = await readCommentInput(event);
  const comments = new CommentsService(useAsmblyr(event));
  const data = await comments.create(target, input);
  event.res.status = 201;
  return { data };
});
