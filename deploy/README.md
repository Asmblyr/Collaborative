# Установка через Docker

Здесь находятся шаблоны установки, не конфигурация действующего облачного кластера.
Приложение собирается из исходников. PostgreSQL 17 и S3-совместимое хранилище
предоставляются установкой; одна команда использует отдельные ресурсы.

## Локальная установка с PostgreSQL и S3

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

## Установка с внешними ресурсами

Соберите образы из текущего checkout:

```sh
docker build --target core -t asmblyr-core:local .
docker build --target ui -t asmblyr-ui:local .
```

Для `deploy/compose.yaml` задайте `CORE_IMAGE`, `UI_IMAGE` и `CORE_ENV_FILE`.
Файл Core env создайте по `apps/core/.env.example`, указав свой PostgreSQL,
приватный S3 bucket и внешний HTTPS origin в `AUTH_UI_URL`.
Для выпуска закрепляйте проверенные image digest. Публичного registry проекта пока нет.

```sh
docker compose -f deploy/compose.yaml up -d --wait
```

Шаблон выполняет миграции перед Core и публикует UI только на loopback.
HTTPS reverse proxy, PostgreSQL, bucket, IAM, копии и мониторинг обслуживает оператор.
Этот шаблон не создаёт облачные ресурсы.

Копирование, восстановление и операторские инструменты описаны в
[руководстве эксплуатации](../docs/development/operations.md).
