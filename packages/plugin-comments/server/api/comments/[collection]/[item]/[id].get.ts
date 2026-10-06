import { defineHandler, useAsmblyr } from "@asmblyr-collaborative/kit";
import {
  readCommentId,
  readCommentTarget,
} from "../../../../schemas/comments.js";
import { CommentsService } from "../../../../services/comments.js";

export default defineHandler(async (event) => {
  const comments = new CommentsService(useAsmblyr(event));
  return {
    data: await comments.get(readCommentTarget(event), readCommentId(event)),
  };
});
