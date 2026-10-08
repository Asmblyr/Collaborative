import { defineConfig } from "vitepress";
import { navigation } from "./navigation";

export default defineConfig({
  lang: "en-US",
  title: "Collaborative",
  description: "Guides, architecture, and API contracts for Collaborative",
  srcExclude: ["public/**"],
  lastUpdated: true,
  locales: {
    root: {
      label: "English",
      lang: "en-US",
      themeConfig: navigation("en"),
    },
    ru: {
      label: "Русский",
      lang: "ru-RU",
      description: "Руководства, архитектура и API-контракты Collaborative",
      themeConfig: {
        ...navigation("ru"),
        outline: { label: "На этой странице" },
        docFooter: { prev: "Предыдущая страница", next: "Следующая страница" },
        sidebarMenuLabel: "Разделы",
        returnToTopLabel: "Наверх",
        skipToContentLabel: "К содержимому",
        darkModeSwitchLabel: "Тема",
        lightModeSwitchTitle: "Светлая тема",
        darkModeSwitchTitle: "Тёмная тема",
        langMenuLabel: "Выбрать язык",
        lastUpdated: { text: "Обновлено" },
        notFound: {
          title: "Страница не найдена",
          quote: "Проверьте адрес или откройте главную страницу документации.",
          linkLabel: "На главную",
          linkText: "На главную",
        },
      },
    },
  },
  themeConfig: {
    logo: {
      light: "/assets/brand/collaborative-symbol.svg",
      dark: "/assets/brand/collaborative-symbol-dark.svg",
      alt: "Collaborative",
    },
    socialLinks: [
      { icon: "github", link: "https://github.com/Asmblyr/Collaborative" },
    ],
    search: {
      provider: "local",
      options: {
        locales: {
          ru: {
            translations: {
              button: {
                buttonText: "Поиск",
                buttonAriaLabel: "Поиск по документации",
              },
              modal: {
                displayDetails: "Показать подробности",
                resetButtonTitle: "Очистить поиск",
                backButtonTitle: "Закрыть поиск",
                noResultsText: "Ничего не найдено",
                footer: {
                  selectText: "выбрать",
                  selectKeyAriaLabel: "Enter",
                  navigateText: "перейти",
                  navigateUpKeyAriaLabel: "Стрелка вверх",
                  navigateDownKeyAriaLabel: "Стрелка вниз",
                  closeText: "закрыть",
                  closeKeyAriaLabel: "Escape",
                },
              },
            },
          },
        },
      },
    },
  },
});
