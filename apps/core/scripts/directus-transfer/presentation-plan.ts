import type { FormLayout, FormNode } from "../../src/collections/form-layout.js";

// Presentation for the imported demo, not collection-specific UI component logic.
export const labels: Record<string, Record<string, string>> = {
  shops: { name: "Название", code: "Код площадки", status: "Статус", mode: "Режим сбора",
    version: "Движок", ads_status: "Сбор рекламы", ads_mode: "Режим сбора рекламы", local_categories: "Категории площадки" },
  shop_categories: { category_id: "Справочная категория", shop_id: "Площадка", url: "Ссылка на категорию",
    local_name: "Название на площадке", status: "Статус", enqueue_products: "Собирать товары",
    enqueue_product_reviews: "Собирать отзывы", extension_category_url: "Ссылка из браузера", clients: "Клиенты" },
  categories: { name: "Название", priority: "Приоритет", parent_id: "Родительская категория" },
};
export const authorLabels: Record<string, string> = {
  user_created: "Автор при импорте · UUID", user_updated: "Редактор в источнике · UUID",
};
export const translatedChoices: Record<string, string> = {
  "$t:published": "Опубликовано", "$t:draft": "Черновик", "$t:archived": "В архиве",
};
export const statuses = [
  { value: "published", label: "Опубликовано", color: "green" },
  { value: "draft", label: "Черновик", color: "gray" },
  { value: "archived", label: "В архиве", color: "amber" },
];
const field = (name: string, width: "half" | "full" = "half"): FormNode =>
  ({ id: `field_${name}`, kind: "field", field: name, width });
const group = (id: string, label: string, children: FormNode[], collapsed = false): FormNode =>
  ({ id, kind: "group", label, description: "", collapsible: true, collapsed, children });
const imported = () => group("import", "Служебные данные импорта", [field("user_created"), field("user_updated")], true);
const form = (children: FormNode[]): FormLayout => ({ version: 1, tabs: [{ id: "main", label: "Карточка", children }] });

export const layouts: Record<string, FormLayout> = {
  shops: form([
    group("identity", "Основное", [field("name"), field("code"), field("status")]),
    group("collection", "Сбор данных", [field("mode"), field("version"), field("ads_status"), field("ads_mode")]),
    imported(),
  ]),
  shop_categories: form([
    group("identity", "Категория на площадке", [field("category_id"), field("shop_id"), field("url", "full"), field("local_name"), field("status")]),
    group("collection", "Сбор данных", [field("enqueue_products"), field("enqueue_product_reviews"), field("extension_category_url", "full")]),
    imported(),
  ]),
  categories: form([
    group("identity", "Основное", [field("name", "full"), field("priority"), field("parent_id")]), imported(),
  ]),
};
