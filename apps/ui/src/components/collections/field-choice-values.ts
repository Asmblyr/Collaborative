import type { FieldPresentation } from "@asmblyr-collaborative/contracts";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";

/** Settings drafts are text; only integer-select API values become numbers. */
export function fieldChoicePayload(
  presentation: FieldPresentation,
  type: string,
  copy: UiCopy = originalCopy,
): FieldPresentation {
  if (!["select", "multiselect"].includes(presentation.interface)) {
    return presentation;
  }
  const options = (presentation.options ?? []).map((option) => {
    let value = option.value;
    if (type === "integer") {
      if (typeof value === "string" && /^-?\d+$/.test(value)) {
        value = Number(value);
      }
      if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        value < -2147483648 ||
        value > 2147483647
      ) {
        throw new Error(
          copy(
            "Значения вариантов должны быть целыми числами от -2147483648 до 2147483647",
          ),
        );
      }
    } else if (typeof value !== "string" || !value.trim()) {
      throw new Error(copy("Задайте непустые значения вариантов"));
    }
    if (!option.label.trim()) {
      throw new Error(copy("Задайте подписи вариантов"));
    }
    return { value, label: option.label };
  });
  if (
    !options.length ||
    new Set(options.map((option) => option.value)).size !== options.length
  ) {
    throw new Error(
      copy("Задайте непустые, уникальные варианты во вкладке «Отображение»"),
    );
  }
  return { ...presentation, options };
}
