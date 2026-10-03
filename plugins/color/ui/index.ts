"use client";

import { defineUiPlugin } from "@asmblyr/kit/ui";
import { ColorEditor } from "./color-editor.tsx";
import { ColorDisplay } from "./color-display.tsx";
import { ColorSettings } from "./color-settings.tsx";

export default defineUiPlugin({
  fieldInterfaces: [
    {
      id: "picker",
      title: "Цвет",
      types: ["text"],
      editor: ColorEditor,
      display: ColorDisplay,
      settings: ColorSettings,
    },
  ],
});
