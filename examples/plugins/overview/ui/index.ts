"use client";

import { defineUiPlugin } from "@asmblyr-collaborative/kit/ui";
import { OverviewPage } from "./pages/overview-page.tsx";

export default defineUiPlugin({
  pages: [
    {
      id: "home",
      title: "Обзор",
      component: OverviewPage,
    },
  ],
});
