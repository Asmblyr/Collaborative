<a id="deployment-and-upgrades"></a>

# Развёртывание и обновление

Для локальной разработки начните с [первого запуска](getting-started.md).
Основная поставка использует отдельные образы Core и UI из одного коммита;
PostgreSQL 17+ и S3-совместимое хранилище подключаются отдельно. Готовые сборки
публикуются в `ghcr.io/asmblyr/collaborative-core` и
`ghcr.io/asmblyr/collaborative-ui`; закрепляйте оба образа одной версии по digest.
Одна собственная установка предназначена для одной команды; workspace не создаёт
отдельный tenant.

| Сценарий                                   | Где начать                                                                                                                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Основная поставка с внешними PostgreSQL/S3 | [`deploy/compose.yaml`](https://github.com/Asmblyr/Collaborative/blob/main/deploy/compose.yaml) и [`deploy/env.example`](https://github.com/Asmblyr/Collaborative/blob/main/deploy/env.example) |
| Локальный стенд с PostgreSQL и MinIO       | [`deploy/local/compose.yaml`](https://github.com/Asmblyr/Collaborative/blob/main/deploy/local/compose.yaml)                                                                                     |
| Совместимый монолитный образ               | [`deploy/compose.monolith.yaml`](https://github.com/Asmblyr/Collaborative/blob/main/deploy/compose.monolith.yaml)                                                                               |

Точные команды сборки и запуска, настройки портов, GHCR и контейнерные проверки —
в [руководстве `deploy`](https://github.com/Asmblyr/Collaborative/blob/main/deploy/README.ru.md).
Основной Compose выполняет миграции отдельным коротким запуском образа Core
перед стартом приложения. Он публикует общий адрес на loopback-порту 3000
по умолчанию. Не переносите локальные секреты и HTTP origin в публичную
установку.

<a id="configuration"></a>

## Конфигурация

Для основной поставки скопируйте `deploy/env.example` в приватный файл вне
репозитория. Core читает `DATABASE_URL` и остальные параметры из окружения;
полный шаблон с комментариями —
[`apps/core/.env.example`](https://github.com/Asmblyr/Collaborative/blob/main/apps/core/.env.example).
Основные группы настроек:

- `ASMBLYR_SETUP_TOKEN` нужен до создания первого superuser.
- `AUTH_UI_URL` задаёт точный внешний origin UI и обязателен в production.
- `SECRETS_LOCAL_KEY` защищает сохраняемые секреты интеграций.
- S3 можно настроить в системных настройках или через `FILES_STORAGE`, `FILES_BUCKET`
  и параметры выбранного провайдера. Bucket создаёт оператор.
- `OPENAI_API_KEY` и `OPENAI_API_MODEL` включают опционального ассистента,
  если `ASSISTANT_ENABLED` не установлен в `false`.
- `OAUTH_ISSUER_URL` и `OAUTH_KEYS_FILE` относятся к Asmblyr как OAuth provider;
  ключи создаются отдельно и сохраняются между обновлениями.

Значения и ограничения описаны в env-шаблонах и на страницах
[интеграций](../features/integrations.md), [файлов](../features/files.md) и
[ассистента](../features/assistant.md). Секреты и ключи держите вне Git и образов.

<a id="public-installations"></a>

## Публичная установка

Разместите UI и Core API за HTTPS reverse proxy. PostgreSQL и bucket должны
оставаться приватными; основной Compose публикует порты только на loopback.
Оператор настраивает TLS, IAM, резервные копии и мониторинг. `GET /health`
проверяет процесс, `GET /ready` — БД и обязательные миграции. Скрипты
резервирования локального стенда не обслуживают внешний облачный bucket.

<a id="upgrades-and-recovery"></a>

## Обновление и восстановление

Перед обновлением сохраните согласованную копию PostgreSQL и объектов, проверьте
восстановление на отдельной установке и выполните миграции **до запуска нового Core**.
Старые миграции не редактируются; `db:rollback` может удалить данные и не заменяет
восстановление из копии. Откат образа возможен только при совместимой схеме.
Для дополнительного локального стенда доступны
[команды backup/restore и проверка статуса](../development/operations.md#копии-локальнои-docker-установки).

Рекомендации по защите установки — в [границах безопасности](../security/overview.md).
