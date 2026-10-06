import { defineHandler, useAsmblyr } from "@asmblyr-collaborative/kit";
import {
  readCommentPage,
  readCommentTarget,
} from "../../../../schemas/comments.js";
import { CommentsService } from "../../../../services/comments.js";

export default defineHandler((event) => {
  const comments = new CommentsService(useAsmblyr(event));
  return comments.list(readCommentTarget(event), readCommentPage(event));
});
