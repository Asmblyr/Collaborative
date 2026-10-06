import { defineHandler, useAsmblyr } from "@asmblyr-collaborative/kit";
import {
  readCommentId,
  readCommentInput,
  readCommentTarget,
} from "../../../../schemas/comments.js";
import { CommentsService } from "../../../../services/comments.js";

export default defineHandler(async (event) => {
  const target = readCommentTarget(event);
  const id = readCommentId(event);
  const input = await readCommentInput(event);
  const comments = new CommentsService(useAsmblyr(event));
  return { data: await comments.update(target, id, input) };
});
