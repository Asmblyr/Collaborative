import type { AssistantProgress } from "@asmblyr-collaborative/contracts";

const toolLabels: Record<string, string> = {
  my_permissions: "Проверяю доступные права",
  list_users: "Ищу пользователей",
  list_policies: "Проверяю политики доступа",
  list_collections: "Ищу коллекции",
  list_skills: "Ищу доступные умения",
  read_skill: "Читаю инструкцию умения",
  describe_collection: "Изучаю поля и связи",
  search_items: "Ищу записи",
  read_item: "Читаю запись",
  count_items: "Считаю записи",
  aggregate_items: "Считаю показатели и группы",
  validate_filter: "Проверяю условия",
  propose_filter: "Готовлю фильтр",
  propose_write: "Готовлю подтверждение изменения",
  present_selection: "Готовлю карточку с результатом",
  present_record: "Готовлю карточку записи",
  present_form: "Готовлю форму создания",
  present_plugin_result: "Готовлю заполненную форму",
};

/** Only controlled labels and counters leave Core; no arguments or model reasoning. */
export function createProgress(emit?: (progress: AssistantProgress) => void) {
  let modelCalls = 0;
  let toolCalls = 0;
  return {
    model(label = "Думаю") {
      modelCalls++;
      emit?.({
        phase: "model",
        label,
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
