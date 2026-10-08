import type { DefaultTheme } from "vitepress";

type Entry = [english: string, russian: string, path: string];
const groups: [english: string, russian: string, entries: Entry[]][] = [
  [
    "Getting started",
    "Начало",
    [
      ["Overview", "Обзор", "/"],
      ["Local setup", "Локальный запуск", "/guide/getting-started"],
      ["Deployment", "Развёртывание", "/guide/deployment"],
      ["Feature map", "Карта возможностей", "/guide/features"],
    ],
  ],
  [
    "Features",
    "Функциональность",
    [
      ["Collections and records", "Коллекции и записи", "/features/data"],
      ["Permissions and policies", "Права и политики", "/features/access"],
      ["Settings", "Настройки", "/features/settings"],
      [
        "Connections and secrets",
        "Подключения и секреты",
        "/features/connections",
      ],
      ["Monitoring and Sentry", "Мониторинг и Sentry", "/features/monitoring"],
      [
        "Translations and language",
        "Переводы и язык",
        "/features/localization",
      ],
      ["Users and SSO", "Пользователи и SSO", "/features/identity"],
      [
        "Service integrations",
        "Сервисные интеграции",
        "/features/integrations",
      ],
      ["Assistant and MCP", "Ассистент и MCP", "/features/assistant"],
      ["Google Workspace", "Google Workspace", "/features/google-workspace"],
      [
        "Discussions and notifications",
        "Обсуждения и уведомления",
        "/features/notifications",
      ],
      ["Live collaboration", "Совместная работа", "/features/realtime"],
      ["Files", "Файлы", "/features/files"],
      ["Workspaces and views", "Пространства и виды", "/features/workspaces"],
      ["Plugins", "Расширения", "/features/plugins"],
    ],
  ],
  [
    "Development",
    "Разработка",
    [
      [
        "Local development",
        "Локальная разработка",
        "/development/local-development",
      ],
      ["Architecture", "Архитектура", "/development/architecture"],
      ["Live architecture", "Архитектура Live", "/architecture/realtime"],
      [
        "Your first plugin",
        "Первое расширение",
        "/development/first-extension",
      ],
      [
        "Assistant architecture",
        "Архитектура ассистента",
        "/development/assistant-architecture",
      ],
      [
        "Documentation workflow",
        "Сопровождение документации",
        "/development/documentation",
      ],
      ["Operations", "Эксплуатация", "/development/operations"],
      ["Plugin actions", "Действия расширений", "/development/plugin-actions"],
    ],
  ],
  [
    "Reference",
    "Справочники",
    [
      ["HTTP / OpenAPI", "HTTP / OpenAPI", "/reference/http"],
      ["Route matrix", "Матрица маршрутов", "/reference/routes"],
      ["SDK guide", "SDK: руководство", "/reference/sdk-guide"],
      [
        "CLI and type generation",
        "CLI: генерация типов",
        "/reference/cli-guide",
      ],
      ["Packages and publishing", "Пакеты и публикация", "/reference/packages"],
      ["SDK types and methods", "SDK: типы и методы", "/reference/sdk/README"],
      ["Kit guide", "Kit: руководство", "/reference/kit-guide"],
      ["Kit types and methods", "Kit: типы и методы", "/reference/kit/README"],
    ],
  ],
  [
    "Security",
    "Безопасность",
    [
      ["Access boundaries", "Границы доступа", "/security/access-matrix"],
      ["Overview", "Обзор", "/security/overview"],
    ],
  ],
];

export function navigation(locale: "en" | "ru"): DefaultTheme.Config {
  const prefix = locale === "ru" ? "/ru" : "";
  const label = locale === "ru" ? 1 : 0;
  const entry = (item: Entry) => ({
    text: item[label],
    link: prefix + item[2],
  });
  return {
    nav: [
      entry(["Product", "Продукт", "/guide/features"]),
      entry(["API and SDK", "API и SDK", "/reference/http"]),
      entry(["Security", "Безопасность", "/security/overview"]),
    ],
    sidebar: groups.map((group) => ({
      text: group[label],
      items: group[2].map(entry),
    })),
  };
}
