"use client";
import { createContext, useContext } from "react";
export const FileLibraryAccess = createContext(false);
export function useFileLibraryAccess() {
  return useContext(FileLibraryAccess);
}
