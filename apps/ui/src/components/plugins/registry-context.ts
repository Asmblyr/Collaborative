"use client";

import { createContext } from "react";
import type { LoadedUiPlugin } from "./registry-loader";

export const PluginRegistryContext = createContext<{
  plugins: LoadedUiPlugin[];
  pending: boolean;
  failedNamespaces: string[];
  retry: () => void;
}>({
  plugins: [],
  pending: false,
  failedNamespaces: [],
  retry: () => undefined,
});
