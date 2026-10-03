import type { AssistantProgress } from "@asmblyr/contracts";

const toolLabels: Record<string, string> = {
  list_collections: "Ищу коллекции",
  describe_collection: "Изучаю поля и связи",
  search_items: "Ищу записи",
  read_item: "Читаю запись",
  count_items: "Считаю записи",
  aggregate_items: "Считаю показатели и группы",
  validate_filter: "Проверяю условия",
  propose_filter: "Готовлю фильтр",
  present_selection: "Готовлю карточку с результатом",
  present_plugin_result: "Готовлю заполненную форму",
};

/** Only controlled labels and counters leave Core; no arguments or model reasoning. */
export function createProgress(emit?: (progress: AssistantProgress) => void) {
  let modelCalls = 0;
  let toolCalls = 0;
  return {
    model() {
      modelCalls++;
      emit?.({
        phase: "model",
        label: "Обрабатываю запрос",
        modelCalls,
        toolCalls,
      });
    },
    tool(name?: string) {
      toolCalls++;
      emit?.({
        phase: "tool",
        label: toolLabels[name ?? ""] ?? "Выполняю инструмент",
        modelCalls,
        toolCalls,
      });
    },
  };
}
