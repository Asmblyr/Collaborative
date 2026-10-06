import type {
  CollectionState,
  FieldPresentation,
} from "@asmblyr-collaborative/contracts";

export function statePresentation(
  state: CollectionState,
  current?: Partial<FieldPresentation>,
): FieldPresentation {
  return {
    label: current?.label || "Состояние",
    description: current?.description ?? "",
    placeholder: "",
    width: current?.width ?? "full",
    order: current?.order ?? 0,
    group: current?.group ?? "",
    interface: "select",
    options: state.statuses.map(({ value, label }) => ({ value, label })),
    display: {
      kind: "status",
      statuses: state.statuses.map(({ value, label, color }) => ({
        value,
        label,
        color,
      })),
    },
  };
}
