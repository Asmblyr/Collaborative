# Asmblyr Collaborative

Админка и HTTP API над PostgreSQL: коллекции, записи, связи, политики доступа,
SSO/OIDC, сервисные интеграции, файлы, ассистент и расширения.

Проект находится на стадии подготовки первой беты. Основной репозиторий:
[Asmblyr/Collaborative](https://github.com/Asmblyr/Collaborative).

- [Документация](docs/index.md)
- [Карта возможностей и ограничений](docs/guide/features.md)
- [Настройки и делегирование прав](docs/features/settings.md)
- [Аудит безопасности 03.10.2026](docs/security/audit-2026-10-03.md)
- [HTTP API](docs/reference/http.md), [SDK](packages/sdk/README.md), [Kit](packages/kit/README.md)
- [Правила разработки и документации](AGENTS.md)

## Быстрый старт

Node.js 22+, pnpm 11.13.0, Docker Compose. Полная настройка первого
superuser и секретов — в [руководстве](docs/guide/getting-started.md).

```powershell
pnpm install
pnpm db:up
# Только если своего .env ещё нет:
Copy-Item apps/core/.env.example apps/core/.env
# Задайте ASMBLYR_SETUP_TOKEN в apps/core/.env перед первой настройкой.
pnpm db:migrate
pnpm dev
```

UI: http://localhost:3000, Core: http://127.0.0.1:3001.
Первая настройка — `/setup`; PostgreSQL локально на порту 5433.

## Проверки

```powershell
pnpm typecheck
pnpm lint
pnpm test:all
pnpm build
pnpm docs:build
```

Интеграционные тесты создают одноразовую локальную БД через `scripts/test.mjs`.
Не запускайте их напрямую против рабочей БД. Live LavinMQ/BFF проверки требуют
отдельного окружения.

`pnpm docs:dev` открывает локальный сайт документации с поиском. Статический
экспорт — `docs/.vitepress/dist`, OpenAPI — `docs/public/openapi.json`.
Справочники SDK/Kit генерируются из TypeScript перед сборкой сайта.

## Структура

`apps/core` — Fastify/Knex; `apps/ui` — Next.js/shadcn;
`packages/contracts` — публичные контракты; `packages/sdk` — HTTP-клиент;
`packages/kit` — API расширений; `plugins/` — локальные пакеты.

Настройки команды находятся в `/system-settings`, личный профиль — `/settings`.
Функции с ограничениями и ещё не реализованные возможности перечислены
в документации; наличие старого design-файла не означает готовую реализацию.

## Локальные данные и публикация

Реальные `.env` и `*.env`, ключи, база, выгрузки, резервные копии, логи и
скриншоты локальных установок исключены из Git. Конфигурацию создавайте из
шаблонов `.env.example` и `infra/beta/env.example`, заполняя собственные секреты.
Облачные инструменты принимают параметры вашей установки; инструкции находятся
в [infra/files](infra/files/README.md).

Перед добавлением новых файлов проверяйте `git status` и содержимое staged diff.
`.gitignore` не удаляет файлы, которые уже были добавлены в Git, и не защищает
секрет, вручную вставленный в исходник.

## Лицензия

Код проекта распространяется по [MIT](LICENSE). Сторонние зависимости сохраняют
собственные лицензии, включая MinIO в дополнительном локальном S3-стенде.
