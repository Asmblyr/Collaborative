# Инструменты Google Workspace для ассистента

<!-- languages -->

[English](README.md) · [Русский](README.ru.md)

<!-- /languages -->

В списке расширений пакет называется Google Workspace благодаря каталогам RU/EN.
Namespace API остаётся google.

Опциональный плагин для личных подключений Google Drive и Sheets. Пять типизированных
H3 model routes: поиск файлов, чтение текста, описание таблицы, чтение диапазона и
предложение записи. Core отвечает за OAuth, шифрование и подтверждение человеком;
плагин не получает Google-токены.

Добавьте @asmblyr-collaborative/plugin-google-workspace в asmblyr.plugins и
одобрите connections.google в asmblyr.pluginPermissions. Сборка:
pnpm --filter @asmblyr-collaborative/plugin-google-workspace build.

[Настройка и ограничения](../../docs/ru/features/google-workspace.md) ·
[Контракт действий](../../docs/ru/development/plugin-actions.md).
