import type { FieldEditorProps } from "@asmblyr/kit/ui";

export const colorPattern = "#[0-9a-fA-F]{6}";
export const defaultPalette = [
  "#64748b",
  "#ef4444",
  "#f97316",
  "#eab308",
  "#22c55e",
  "#14b8a6",
  "#3b82f6",
  "#8b5cf6",
];

export function isHexColor(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

export function readColorOptions(options: FieldEditorProps["options"]): {
  palette: string[];
  allowCustom: boolean;
} {
  const palette = options.palette;
  const validPalette =
    Array.isArray(palette) &&
    palette.length > 0 &&
    palette.length <= 24 &&
    palette.every((entry) => typeof entry === "string");

  return {
    // Preserve incomplete settings while editing; only valid colors become swatches.
    palette: validPalette ? palette : defaultPalette,
    allowCustom: options.allowCustom !== false,
  };
}
