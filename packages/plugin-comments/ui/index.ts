"use client";

import { defineUiPlugin } from "@asmblyr/kit/ui";
import { CommentsPanel } from "./components/comments-panel.tsx";
import { supportsComments } from "../shared/comments.ts";

export default defineUiPlugin({
  recordPanels: [
    {
      id: "discussion",
      title: "Обсуждение",
      component: CommentsPanel,
      supports: ({ collection }) => supportsComments(collection),
    },
  ],
});
