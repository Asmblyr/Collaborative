import type { FilterGroup } from "@/components/items/item-filter-options";
import type {
  AssistantFilterProposal,
  AssistantDataAccess,
} from "@asmblyr-collaborative/contracts";
import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";

export interface PageContext {
  page: string;
  workspaceId: string | null;
  collection?: string;
  record?: { id: string };
  table?: {
    page: number;
    size: number;
    sort: string;
    direction: "asc" | "desc";
    order?: import("@asmblyr-collaborative/contracts").ItemOrder;
    q: string;
    filter: string;
    selectedCount: number;
    editorOpen: boolean;
  };
}
export type FilterProposal = AssistantFilterProposal<FilterGroup>;

/** Repeating an old question must not restore tool access the user has turned off. */
export function retryDataAccess(
  context: PageContext | null,
  original: AssistantDataAccess | undefined,
  current: AssistantDataAccess | undefined,
): AssistantDataAccess | undefined {
  if (current?.enabled !== false) {
    return original;
  }
  return {
    enabled: false,
    workspaceId: original?.workspaceId ?? context?.workspaceId ?? null,
  };
}

export function contextScope(
  context: PageContext | null,
  dataAccess?: AssistantDataAccess,
): string {
  if (!context) {
    if (dataAccess?.enabled) {
      return `${dataAccess.workspaceId ?? "all"}:data`;
    }
    if (dataAccess?.workspaceId) {
      return `${dataAccess.workspaceId}:chat`;
    }
    return "chat";
  }
  const scope = `${context.workspaceId ?? "all"}:${context.page}:${context.collection ?? ""}`;
  const pageScope = context.record
    ? `${scope}:record:${encodeURIComponent(context.record.id)}`
    : scope;
  return dataAccess?.enabled === false ? `${pageScope}:data-off` : pageScope;
}
export function canApplyProposal(
  context: PageContext | null,
  proposal: FilterProposal,
): boolean {
  return Boolean(
    context?.page === "items" &&
      context.table &&
      !context.record &&
      !context.table.editorOpen &&
      context.collection === proposal.collection &&
      context.workspaceId === proposal.workspaceId,
  );
}
export const contextPageLabels: Record<string, string> = {
  home: "Главная",
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
  copy: UiCopy = originalCopy,
  dataAccess?: AssistantDataAccess,
): string {
  const label = pageContextLabel(context, collectionDisplayName, copy);
  return dataAccess?.enabled === false
    ? `${label}${copy(" · без доступа к данным")}`
    : label;
}

function pageContextLabel(
  context: PageContext | null,
  collectionDisplayName: ((name: string) => string | undefined) | undefined,
  copy: UiCopy,
): string {
  if (!context) {
    return copy("Без контекста страницы");
  }
  const title = context.collection
    ? collectionDisplayName?.(context.collection) || context.collection
    : copy(contextPageLabels[context.page] ?? "") ||
      (context.page.startsWith("extensions/")
        ? copy("Расширение")
        : copy("Страница"));
  if (context.record) {
    return `${title} · ${copy("Запись")} ${context.record.id}`;
  }
  if (context.table?.editorOpen) {
    return `${title}${copy(" · открыт редактор")}`;
  }
  if (context.table?.selectedCount) {
    return `${title}${copy(" · выбрано {{value0}}", { value0: context.table.selectedCount })}`;
  }
  return title;
}
