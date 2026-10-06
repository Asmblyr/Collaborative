import assert from "node:assert/strict";
import test from "node:test";
import { AssistantDraftStore } from "../src/components/assistant/assistant-draft-store";

test("each conversation keeps its own unsent text when starting and revisiting sessions", () => {
  const drafts = new AssistantDraftStore();
  drafts.select("first");
  drafts.write("  Первый вопрос\nсо второй строкой  ");
  assert.equal(drafts.select("second"), "");
  drafts.write("Другой вопрос");
  assert.equal(drafts.has("first"), true);
  assert.equal(drafts.has("second"), true);
  assert.equal(drafts.select("first"), "  Первый вопрос\nсо второй строкой  ");
  assert.equal(drafts.select("second"), "Другой вопрос");
  drafts.write("");
  assert.equal(drafts.has("second"), false);
  assert.equal(drafts.select("first"), "  Первый вопрос\nсо второй строкой  ");
});

test("typing before the first session arrives is adopted without losing formatting", () => {
  const drafts = new AssistantDraftStore();
  drafts.write("Неотправленный\nвопрос");
  assert.equal(drafts.select("loaded"), "Неотправленный\nвопрос");
  assert.equal(drafts.select("new"), "");
  assert.equal(drafts.select("loaded"), "Неотправленный\nвопрос");
  drafts.write("  \n");
  assert.equal(drafts.has("loaded"), false);
  assert.equal(drafts.text, "  \n");
});

test("refreshing the same session and clearing a retried prompt preserve later edits", () => {
  const drafts = new AssistantDraftStore();
  drafts.select("first");
  drafts.write("original");
  assert.equal(drafts.select("first"), "original");
  drafts.write("later edit");
  drafts.write((previous) => (previous === "original" ? "" : previous));
  assert.equal(drafts.text, "later edit");
  drafts.write((previous) => (previous === "later edit" ? "" : previous));
  assert.equal(drafts.text, "");
  assert.equal(drafts.has("first"), false);
});

test("removing a session discards only its draft and leaves other sessions recoverable", () => {
  const drafts = new AssistantDraftStore();
  drafts.select("first");
  drafts.write("keep");
  drafts.select("third");
  drafts.write("recover");
  drafts.select("second");
  drafts.write("remove");
  assert.equal(drafts.remove("first"), "remove");
  assert.equal(drafts.has("first"), false);
  drafts.write("current");
  assert.equal(drafts.remove("second"), "");
  assert.equal(drafts.select("second"), "");
  assert.equal(drafts.select("third"), "recover");
  const otherWidget = new AssistantDraftStore();
  assert.equal(otherWidget.select("third"), "");
});
