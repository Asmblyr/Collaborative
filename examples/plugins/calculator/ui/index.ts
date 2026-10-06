"use client";

import { defineUiPlugin } from "@asmblyr-collaborative/kit/ui";
import { CalculatorPage } from "./pages/calculator-page.tsx";

export default defineUiPlugin({
  pages: [{ id: "home", title: "Калькулятор", component: CalculatorPage }],
});
