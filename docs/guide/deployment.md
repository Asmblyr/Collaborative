# Развёртывание и обновление

Для локальной разработки начните с [первого запуска](./getting-started.md).
В репозитории есть два Docker Compose шаблона. Оба собирают приложение из исходников:
готовых release-образов проект пока не публикует. Отдельно доступна
[рабочая консоль](https://console.asmblyr.io/).
Одна установка предназначена для одной команды; workspace не создаёт отдельный tenant.

| Сценарий                       | Шаблон                                                                                                      | Зависимости                                            |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Локальная установка            | [`deploy/local/compose.yaml`](https://github.com/Asmblyr/Collaborative/blob/main/deploy/local/compose.yaml) | PostgreSQL 17 и S3-хранилище внутри Compose            |
| Установка с внешними ресурсами | [`deploy/compose.yaml`](https://github.com/Asmblyr/Collaborative/blob/main/deploy/compose.yaml)             | PostgreSQL и приватный S3-совместимый bucket оператора |

Точные команды, имена переменных Compose и образы приведены в
[руководстве `deploy`](https://github.com/Asmblyr/Collaborative/blob/main/deploy/README.md).
Не переносите локальные значения секретов и HTTP origin в публичную установку.

## Конфигурация

Core читает `DATABASE_URL` и остальные параметры из окружения. Шаблон с
комментариями — [`apps/core/.env.example`](https://github.com/Asmblyr/Collaborative/blob/main/apps/core/.env.example).
UI использует `CORE_URL` для серверного соединения с Core; пример —
[`apps/ui/.env.example`](https://github.com/Asmblyr/Collaborative/blob/main/apps/ui/.env.example).
Основные группы настроек:

- `ASMBLYR_SETUP_TOKEN` нужен до создания первого superuser; не храните его в Git.
- `AUTH_UI_URL` задаёт точный внешний origin UI и обязателен в production.
- `FILES_STORAGE`, `FILES_BUCKET` и переменные выбранного S3/YC провайдера
  включают содержимое файлов. Без драйвера метаданные доступны, загрузка — нет.
- `OPENAI_API_KEY` и `OPENAI_API_MODEL` включают опционального ассистента,
  если `ASSISTANT_ENABLED` не установлен в `false`.
- `OAUTH_ISSUER_URL` и `OAUTH_KEYS_FILE` относятся к Asmblyr как OAuth provider;
  ключи создаются отдельно и сохраняются между обновлениями.

Значения и ограничения остальных параметров описаны в env-шаблонах и на страницах
[авторизации](../features/identity.md), [файлов](../features/files.md) и
[ассистента](../features/assistant.md). Секреты и ключи держите вне Git и образов.

## Публичная установка

Разместите UI за HTTPS reverse proxy. PostgreSQL, Core и bucket должны оставаться
приватными; `deploy/compose.yaml` публикует UI только на loopback. Оператор
настраивает TLS, IAM, резервные копии и мониторинг. `GET /health` проверяет процесс,
`GET /ready` — БД и обязательные миграции. Скрипты резервирования локального Compose
не обслуживают внешний облачный bucket.

## Обновление и восстановление

Перед обновлением сохраните согласованную копию PostgreSQL и объектов, проверьте
восстановление на отдельной установке и выполните миграции **до запуска нового Core**.
Старые миграции не редактируются; `db:rollback` может удалить данные и не заменяет
восстановление из копии. Откат образа возможен только при совместимой схеме.
Для локального Compose доступны [команды backup/restore и проверка статуса](../development/operations.md#копии-локальной-docker-установки).

Рекомендации по защите установки — в [границах безопасности](../security/overview.md).
