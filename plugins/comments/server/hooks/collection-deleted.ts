import { defineHook } from "@asmblyr/kit";
import { deleteComments } from "../services/cleanup.js";

export default defineHook("collections.delete", async (event, context) => {
  await deleteComments(context, event.collection);
});
