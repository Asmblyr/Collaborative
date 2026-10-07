# Установка Collaborative

Production поставляется двумя образами из одного коммита: **Core** и **UI**.
PostgreSQL 17+ и S3 подключаются отдельно. SDK, Kit, контракты и встроенные плагины
собираются из исходников монорепозитория; предварительная публикация в npm не нужна.

## Docker Compose

Соберите оба образа из одного checkout с одинаковым идентификатором сборки:

```sh
docker build --target core --build-arg DEPLOYMENT_VERSION=local -t collaborative-core:local .
docker build --target ui --build-arg DEPLOYMENT_VERSION=local -t collaborative-ui:local .
```

Скопируйте `deploy/env.example` в приватный файл вне репозитория. Задайте
`DATABASE_URL`, случайный `ASMBLYR_SETUP_TOKEN` (32+ символа), публичный origin в
`AUTH_UI_URL` и `SECRETS_LOCAL_KEY` согласно [настройкам интеграций](../docs/features/integrations.md).
S3 можно подключить через системные настройки или env. Бакет должен существовать.

```sh
export ASMBLYR_CORE_IMAGE=collaborative-core:local
export ASMBLYR_UI_IMAGE=collaborative-ui:local
export ASMBLYR_ENV_FILE=/private/collaborative.env
docker compose -f deploy/compose.yaml up -d --wait
```

Compose запускает миграции отдельным коротким запуском Core, затем Core и UI.
Публичный адрес по умолчанию `http://localhost:3000`; API доступен на `/api`.
`UI_PORT` и `BIND_ADDRESS` меняют публикацию порта. Внешний HTTPS reverse proxy
направьте на этот порт. `AUTH_UI_URL` должен совпадать с адресом в браузере.
Первого администратора создайте на `/setup`.

В Compose публичный listener Core обрабатывает API и передаёт страницы в UI.
Next не проксирует API. UI получает только внутренний `CORE_URL` и общий
`SESSION_COOKIE_PREFIX`, без секретов PostgreSQL, S3 и провайдеров.
Если меняете префикс cookies, задайте `SESSION_COOKIE_PREFIX` в окружении Compose.
Для production закрепляйте **оба** образа одной версии по digest.

## Kubernetes и Helm

Чарт находится в [`deploy/helm/collaborative`](helm/collaborative).
Он создаёт два Deployment, два ClusterIP Service, опциональный Ingress и Job миграций.
Все ресурсы относятся к namespace релиза; чарт не создаёт БД, bucket, CRD,
кластерные роли, ingress-контроллер или cert-manager.

До установки подготовьте namespace и Secret `collaborative-core` с параметрами Core
из `deploy/env.example`. Secret и внешняя БД должны существовать **до** Helm:
миграции выполняются hook Job перед созданием остальных ресурсов.
В приватном values-файле укажите, например:

```yaml
publicUrl: https://admin.example.com
existingSecret: collaborative-core
images:
  core:
    repository: ghcr.io/asmblyr/collaborative-core
    digest: sha256:REPLACE_WITH_VERIFIED_CORE_DIGEST
  ui:
    repository: ghcr.io/asmblyr/collaborative-ui
    digest: sha256:REPLACE_WITH_VERIFIED_UI_DIGEST
ingress:
  enabled: true
  className: your-ingress-class
  tlsSecretName: admin-tls
core:
  replicas: 1
ui:
  replicas: 1
```

```sh
helm upgrade --install collaborative deploy/helm/collaborative \
  --namespace collaborative --values /private/collaborative-values.yaml \
  --wait --timeout 10m
```

TLS Secret также принадлежит namespace релиза. `ingress.annotations` позволяет
передать настройки своего контроллера: таймаут для потоков ассистента должен
покрывать `OPENAI_API_TIMEOUT_MS`, буферизацию потоков следует отключить,
лимит тела запроса согласовать с лимитом файлов Core. Чарт использует стандартные
Prefix-маршруты, не требует regex, rewrite-target или snippets.
При внешнем Gateway задайте `ingress.enabled: false` и повторите маршруты:

| Путь                                                | Компонент       |
| --------------------------------------------------- | --------------- |
| `/api`, `/sign/sso`, `/connections/google/callback` | Core, порт 3001 |
| `/oauth/interaction`                                | UI, порт 3000   |
| `/oauth` (включая `/oauth/complete/:uid`)           | Core, порт 3001 |
| `/`                                                 | UI, порт 3000   |

Самый длинный Prefix имеет приоритет. Cookie взаимодействия OAuth ограничена
`/oauth`; страница согласия и серверное завершение находятся в разных ветках.
Внутренний запрос UI к Core при рендеринге содержит сессию пользователя.
Публичные callbacks и HTTPS origin остаются на том же домене.

`coreEnv` задаёт несекретные настройки Core. `TRUST_PROXY` — список адресов/CIDR
доверенного ingress через запятую; по умолчанию forwarded IP не доверяются.
Указывайте фактические адреса прокси и ограничивайте сетевой доступ к Core:
доверие всей сети без NetworkPolicy позволяет подделать адрес клиента.
Для приватных образов используйте `image.pullSecrets`.

Для ключей OAuth-сервера и других файлов Core используйте отдельные заранее
созданные Secrets. Каждый ключ Secret станет файлом в `/run/secrets/<name>`:

```yaml
coreSecretFiles:
  - name: oauth
    secretName: collaborative-oauth
coreEnv:
  OAUTH_ISSUER_URL: https://admin.example.com/oauth
  OAUTH_KEYS_FILE: /run/secrets/oauth/keys.json
```

В этом примере Secret `collaborative-oauth` содержит ключ `keys.json`.
Создание файла описано в [руководстве эксплуатации](../docs/development/operations.md).
Файлы подключаются только к Core и Job миграций, только для чтения. UI их не получает.
После изменения ключей или env выполните rollout Core; каждый экземпляр должен
использовать одинаковые настройки. В Docker Compose аналогичные файлы подключаются
через приватный override с `volumes` для Core и при необходимости миграций.

Проверки Core: `/health` для жизни процесса, `/ready` для БД и миграций.
UI проверяется через `/healthz`, независимо от БД. Контейнеры работают без root,
без service-account token и с read-only root filesystem; временные файлы и
кэш UI хранятся в ограниченных `emptyDir`. Ресурсы настраиваются отдельно.

## Реплики и обновления

Core и UI по умолчанию имеют по одной реплике. Сессии, ограничения входа,
суточные/минутные лимиты ассистента, leases, запросы отмены и подготовленные формы
плагинов хранятся в PostgreSQL и доступны всем репликам. Проверка удалённой отмены
выполняется активным Core каждые 500 мс. Формы ограничены владельцем и живут 20 минут.
Процессные ограничения остаются дополнительной защитой ресурсов каждого Core.
Пользовательские плагины сами отвечают за внешние эффекты и общее состояние.

Действующий поток ответа принадлежит одному соединению. При остановке Core он
прерывается; автоматического бесшовного продолжения генерации на другой реплике нет.
История сохраняется, незавершённый запрос можно повторить. Sticky sessions не требуются.

Оба образа собираются с одним `DEPLOYMENT_VERSION` (в CI — commit SHA). Next использует
его для обнаружения несовпадения версии клиента и сервера; это не маршрутизация по
версиям и не гарантия доступности старых JS-файлов во время обновления. Для строгого
нулевого простоя интерфейса нужны сохранение старых ресурсов или переключение всего
релиза после готовности. Не смешивайте произвольные версии Core/UI.

Перед обновлением делайте копию БД. Миграции должны быть совместимы со старым Core,
который может продолжать обслуживать запросы во время rollout. Helm ждёт Job миграций;
ошибка останавливает установку/обновление. **Helm rollback не откатывает PostgreSQL**.
Удаление релиза не удаляет внешнюю БД, S3 и заранее созданные Secrets.

## CI и реестр

GitHub Actions проверяет код, собирает два образа, проверяет их с одноразовой
PostgreSQL и валидирует Helm-чарт. После успешных проверок основной ветки или
релизного Git-тега workflow публикует:

- `ghcr.io/asmblyr/collaborative-core`;
- `ghcr.io/asmblyr/collaborative-ui`;
- OCI-чарт `oci://ghcr.io/asmblyr/charts/collaborative`.

Образы получают теги `sha-<commit>`, `edge` для main и версию для Git-тега `v*`.
Чарт main получает `0.1.0-edge.<run-number>`; релизный чарт — версию Git-тега.
Версии и digest опубликованных артефактов указаны в
[GitHub Releases](https://github.com/Asmblyr/Collaborative/releases).
Для неопубликованных изменений собирайте образы локально и ставьте чарт из
репозитория. CI не разворачивает приложение на сервере.

```sh
node scripts/test.mjs container-split collaborative-core:local collaborative-ui:local
node scripts/chart-check.mjs
```

Проверка контейнеров создаёт одноразовые PostgreSQL и Docker-сеть и удаляет их.

## Совместимость и локальный стенд

Существующий монолитный target `app` и `deploy/compose.monolith.yaml` сохранены
для перехода существующих установок. Новый CI публикует раздельные образы.
`deploy/local/compose.yaml` содержит дополнительный стенд разработки с PostgreSQL
и MinIO. Это отдельные внешние для приложения сервисы. MinIO имеет лицензию AGPL.
Скопируйте `deploy/local/env.example` в приватный файл, задайте секреты и выполните:

```sh
docker compose --env-file /private/local.env -p asmblyr-local -f deploy/local/compose.yaml up -d --build --wait
```

Адрес по умолчанию `http://localhost:3300`. Для остановки без удаления данных
используйте `down` без `-v`. Эксплуатационные сценарии и копирование описаны в
[руководстве эксплуатации](../docs/development/operations.md).
