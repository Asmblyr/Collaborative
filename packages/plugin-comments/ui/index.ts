"use client";

import ru from "../locales/ru.json" with { type: "json" };
import en from "../locales/en.json" with { type: "json" };

import { defineUiPlugin } from "@asmblyr-collaborative/kit/ui";
import { CommentsPanel } from "./components/comments-panel.tsx";
import { supportsComments } from "../shared/comments.ts";

export default defineUiPlugin({
  translations: { ru, en },
  recordPanels: [
    {
      id: "discussion",
      title: "Обсуждение",
      titleKey: "panel.title",
      component: CommentsPanel,
      supports: ({ collection }) => supportsComments(collection),
    },
  ],
});
