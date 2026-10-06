# Установка через Docker

Основной образ содержит **UI и Core API в одном контейнере**. PostgreSQL и
S3-совместимое хранилище подключаются отдельно. SDK, Kit, контракты и встроенные
плагины собираются из исходников монорепозитория; скачивать их из npm не нужно.
Сторонние зависимости устанавливаются по `pnpm-lock.yaml`.

## Один контейнер с внешними PostgreSQL и S3

Соберите образ из корня репозитория:

```sh
docker build -t asmblyr-collaborative:local .
```

Скопируйте `deploy/env.example` в приватный файл вне репозитория. Задайте
`DATABASE_URL` внешнего PostgreSQL 17+, случайный `ASMBLYR_SETUP_TOKEN` (32+ символа)
и публичный адрес UI в `AUTH_UI_URL`. Для хранения секретов интеграций задайте
`SECRETS_LOCAL_KEY` согласно [настройкам интеграций](../docs/features/integrations.md).
S3 можно подключить через системные настройки или env. Бакет должен существовать.

```sh
export ASMBLYR_IMAGE=asmblyr-collaborative:local
export ASMBLYR_ENV_FILE=/private/asmblyr.env
docker compose -f deploy/compose.yaml up -d --wait
```

Compose выполняет миграции отдельным коротким запуском **того же образа**, затем
оставляет один контейнер приложения:

| Порт   | Назначение                                     |
| ------ | ---------------------------------------------- |
| `3000` | UI и его серверные маршруты                    |
| `3001` | Полноценный Core API для SDK, CLI и интеграций |

Оба порта публикуются на `127.0.0.1` хоста по умолчанию. Для доступа через сетевой
интерфейс задайте `BIND_ADDRESS`; для других портов хоста — `UI_PORT` и `API_PORT`.
В production подключите HTTPS reverse proxy к обоим портам, например UI на
`admin.example.com`, API на `api.example.com`. Авторизация API остаётся обязательной.
UI обращается к Core внутри контейнера; задавать `CORE_URL` не нужно.

Первого администратора создайте на `/setup`. Healthcheck проверяет UI, БД и наличие
миграций. Падение любого процесса завершает контейнер с ошибкой; Compose перезапускает
приложение. Остановка даёт обоим процессам до 25 секунд.

Без Compose миграции запускаются явно, перед приложением:

```sh
docker run --rm --env-file /private/asmblyr.env asmblyr-collaborative:local node scripts/container/migrate.mjs
docker run -d --name asmblyr --restart unless-stopped --stop-timeout 30 --env-file /private/asmblyr.env -p 3000:3000 -p 3001:3001 asmblyr-collaborative:local
```

## CI и публикация

GitHub Actions проверяет проект, собирает образ и запускает его с одноразовым
PostgreSQL: проверяются миграции, ресурсы UI, создание администратора, прямой API,
страница коллекций и остановка процессов. Затем публикуется Linux amd64 образ
`ghcr.io/asmblyr/collaborative`:

- `sha-<полный commit SHA>` — образ конкретного коммита;
- `edge` — последняя прошедшая проверки сборка `main`;
- `1.0.0-beta.1` — пример тега для Git-тега `v1.0.0-beta.1`.

Pull request проверяет контейнер без публикации. Используется встроенный
`GITHUB_TOKEN` с `packages: write`; npm-токен и предварительный выпуск SDK не нужны.
`publish-packages.yml` остаётся отдельным ручным процессом выпуска npm.
После первого выпуска проверьте видимость пакета в GHCR: для анонимного скачивания
она должна быть `Public`. Для установки закрепляйте image digest вместо `edge`.
CI публикует образ, но не разворачивает приложение на сервере.

Локально тот же тест запускается без подключения к рабочей БД:

```sh
node scripts/test.mjs container asmblyr-collaborative:local
```

Он создаёт отдельные контейнеры и сеть и удаляет их после проверки.
PostgreSQL теста не входит в образ приложения.

## Дополнительный стенд разработки с PostgreSQL и S3

`deploy/local/compose.yaml` сохраняет прежний стенд с раздельными UI/Core,
PostgreSQL и MinIO для разработки и проверки восстановления. Эти сервисы
не входят в публикуемый образ приложения.

Создайте приватную копию `deploy/local/env.example`, заполните пустые значения
случайными секретами. Пароль БД должен быть безопасен для включения в URL.
`UI_ORIGIN` должен совпадать с адресом браузера; `UI_PORT` задаёт loopback-порт UI.

```sh
docker compose --env-file /private/asmblyr.env -p asmblyr-local -f deploy/local/compose.yaml up -d --build --wait
node scripts/operations/status.mjs /private/asmblyr.env asmblyr-local
```

UI по умолчанию доступен на `http://localhost:3300`. Первый администратор создаётся
на `/setup` с `SETUP_TOKEN`. PostgreSQL, S3 и Core не публикуют порты на хосте.
Локальное хранилище собирается из MinIO; его лицензия — AGPL.
Для остановки без удаления данных используйте тот же compose с `down` без `-v`.

HTTPS reverse proxy, PostgreSQL, bucket, IAM, копии и мониторинг обслуживает оператор.
Шаблоны не создают облачные ресурсы.

Копирование, восстановление и операторские инструменты описаны в
[руководстве эксплуатации](../docs/development/operations.md).
