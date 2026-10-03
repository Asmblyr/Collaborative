import { defineConfig } from "vitepress";

export default defineConfig({
  lang: "ru-RU",
  title: "Asmblyr",
  description: "Возможности, архитектура и контракты Asmblyr Collaborative",
  srcExclude: [
    "design/**",
    "ideas/**",
    "research/**",
    "reviews/**",
    "public/**",
  ],
  lastUpdated: true,
  themeConfig: {
    outline: { label: "На этой странице" },
    docFooter: { prev: "Предыдущая страница", next: "Следующая страница" },
    sidebarMenuLabel: "Разделы",
    returnToTopLabel: "Наверх",
    skipToContentLabel: "К содержимому",
    darkModeSwitchLabel: "Тема",
    lightModeSwitchTitle: "Светлая тема",
    darkModeSwitchTitle: "Тёмная тема",
    search: {
      provider: "local",
      options: {
        translations: {
          button: {
            buttonText: "Поиск",
            buttonAriaLabel: "Поиск по документации",
          },
        },
      },
    },
    nav: [
      { text: "Продукт", link: "/guide/features" },
      { text: "API и SDK", link: "/reference/http" },
      { text: "Безопасность", link: "/security/audit-2026-10-03" },
    ],
    sidebar: [
      {
        text: "Начало",
        items: [
          { text: "Обзор", link: "/" },
          { text: "Локальный запуск", link: "/guide/getting-started" },
          { text: "Карта возможностей", link: "/guide/features" },
        ],
      },
      {
        text: "Функциональность",
        items: [
          { text: "Коллекции и записи", link: "/features/data" },
          { text: "Права и политики", link: "/features/access" },
          { text: "Настройки", link: "/features/settings" },
          { text: "Пользователи и SSO", link: "/features/identity" },
          { text: "Сервисные интеграции", link: "/features/integrations" },
          { text: "Ассистент и MCP", link: "/features/assistant" },
          { text: "Файлы", link: "/features/files" },
          { text: "Рабочие пространства и виды", link: "/features/workspaces" },
          { text: "Расширения", link: "/features/plugins" },
        ],
      },
      {
        text: "Разработка",
        items: [
          { text: "Архитектура", link: "/development/architecture" },
          {
            text: "Проверки и документация",
            link: "/development/documentation",
          },
          { text: "Эксплуатация", link: "/development/operations" },
          { text: "Проверка первой беты", link: "/security/beta-2026-10-03" },
        ],
      },
      {
        text: "Справочники",
        items: [
          { text: "HTTP / OpenAPI", link: "/reference/http" },
          { text: "Матрица маршрутов", link: "/reference/routes" },
          { text: "SDK: руководство", link: "/reference/sdk-guide" },
          { text: "SDK: типы и методы", link: "/reference/sdk/README" },
          { text: "Kit: руководство", link: "/reference/kit-guide" },
          { text: "Kit: типы и методы", link: "/reference/kit/README" },
        ],
      },
      {
        text: "Аудит",
        items: [
          { text: "Границы доступа", link: "/security/access-matrix" },
          { text: "Аудит 03.10.2026", link: "/security/audit-2026-10-03" },
          {
            text: "Назначение готовых политик",
            link: "/security/policy-delegation-2026-10-03",
          },
          { text: "Архив исследований и решений", link: "/archive" },
        ],
      },
    ],
  },
});
