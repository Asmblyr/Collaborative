import type { FilterGroup } from "@/components/items/item-filter-options";
import type { AssistantFilterProposal } from "@asmblyr/contracts";

export interface PageContext {
  page: string;
  workspaceId: string | null;
  collection?: string;
  table?: {
    page: number;
    size: number;
    sort: string;
    direction: "asc" | "desc";
    q: string;
    filter: string;
    selectedCount: number;
    editorOpen: boolean;
  };
}
export type FilterProposal = AssistantFilterProposal<FilterGroup>;
export function contextScope(context: PageContext | null): string {
  return context
    ? `${context.workspaceId ?? "all"}:${context.page}:${context.collection ?? ""}`
    : "chat";
}
export function canApplyProposal(
  context: PageContext | null,
  proposal: FilterProposal,
): boolean {
  return Boolean(
    context?.page === "items" &&
      context.table &&
      !context.table.editorOpen &&
      context.collection === proposal.collection &&
      context.workspaceId === proposal.workspaceId,
  );
}
export const contextPageLabels: Record<string, string> = {
  collections: "Коллекции",
  files: "Файлы",
  access: "Доступ",
  services: "Сервисы",
  settings: "Профиль",
  "system-settings": "Настройки системы",
  search: "Поиск",
};
export function contextLabel(
  context: PageContext | null,
  collectionDisplayName?: (name: string) => string | undefined,
): string {
  if (!context) return "Без контекста страницы";
  const title = context.collection
    ? collectionDisplayName?.(context.collection) || context.collection
    : (contextPageLabels[context.page] ??
      (context.page.startsWith("extensions/") ? "Расширение" : "Страница"));
  return `${title}${context.table?.editorOpen ? " · открыт редактор" : context.table?.selectedCount ? ` · выбрано ${context.table.selectedCount}` : ""}`;
}
