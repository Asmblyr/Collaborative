import {
  parseTags,
  tagLimits,
  TagValueError,
} from "@asmblyr-collaborative/contracts";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";

export function tagErrorMessage(
  error: unknown,
  copy: UiCopy = originalCopy,
): string {
  if (!(error instanceof TagValueError)) {
    return copy("Некорректный список тегов");
  }
  switch (error.code) {
    case "type":
      return copy("Теги должны быть списком строк");
    case "count":
      return copy("Можно добавить не больше {{value0}} тегов", {
        value0: tagLimits.count,
      });
    case "required":
      return copy("Добавьте хотя бы один тег");
    case "control":
      return copy(
        "Тег не должен содержать переносы строк и управляющие символы",
      );
    case "empty":
      return copy("Тег не может быть пустым");
    case "length":
      return copy("Тег должен быть не длиннее {{value0}} символов", {
        value0: tagLimits.length,
      });
    case "duplicate":
      return copy("Такой тег уже добавлен");
  }
}

/** Invalid legacy JSON remains visible and editable without dropping entries. */
export function tagsDraft(value: string): string[] | null {
  if (!value) {
    return [];
  }
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed === null ? [] : parseTags(parsed);
  } catch {
    return null;
  }
}
