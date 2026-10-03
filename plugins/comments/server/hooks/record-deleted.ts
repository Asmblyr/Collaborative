import { defineHook } from "@asmblyr/kit";
import { deleteComments } from "../services/cleanup.js";

export default defineHook("items.delete", async (event, context) => {
  await deleteComments(context, event.collection, event.itemId);
});
