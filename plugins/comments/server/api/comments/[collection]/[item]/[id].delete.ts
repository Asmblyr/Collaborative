import { defineHandler, useAsmblyr } from "@asmblyr/kit";
import { readCommentId, readCommentTarget } from "../../../../schemas/comments.js";
import { CommentsService } from "../../../../services/comments.js";

export default defineHandler(async (event) => {
  const comments = new CommentsService(useAsmblyr(event));
  await comments.delete(readCommentTarget(event), readCommentId(event));
  event.res.status = 204;
  return null;
});
