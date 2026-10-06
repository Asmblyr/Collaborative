import { defineHandler, useAsmblyr } from "@asmblyr-collaborative/kit";
import { readCommentTarget } from "../../../../schemas/comments.js";
import { CommentsService } from "../../../../services/comments.js";

export default defineHandler((event) => {
  const comments = new CommentsService(useAsmblyr(event));
  return comments.following(readCommentTarget(event));
});
