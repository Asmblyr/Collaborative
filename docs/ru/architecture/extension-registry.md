# Архитектура реестра расширений

Единица расширения — npm/workspace-пакет из корневого списка `asmblyr.plugins`.
Core проверяет manifest до импорта, затем загружает серверные маршруты, hooks и
настройки в доверенный процесс Node.js. `plugin.ts` остаётся `definePlugin({})`.
Список `asmblyr.pluginPermissions` отдельно одобряет запрошенные capabilities.

Рабочая область pnpm содержит Core в `apps/core`, интерфейс Next.js в `apps/ui`,
Kit в `packages/kit`, HTTP SDK в `packages/sdk` и CLI в `packages/cli`.
Маршруты Core используют Fastify и существующие права раздела настроек;
миграции Knex владеют таблицами Core в `public`. Существующий редактор
проверяет обычные настройки плагина. Тесты запускаются через Node test runner,
а интеграционные — через `scripts/test.mjs` с отдельной базой PostgreSQL.
Сборка пакетов создаёт индексы маршрутов и UI, поэтому активация использует
имеющееся обнаружение в source и production.

## Метаданные и зависимости

Manifest версии 1 сохраняет `namespace` и `capabilities`. Дополнительные поля
описаны в [руководстве](../features/plugins.md). Версия пакета и диапазоны
зависимостей проверяются через semver. Обязательные зависимости должны быть
настроены, включены и совместимы; циклы блокируют активацию. Необязательные
зависимости не блокируют запуск. Метаданные читаются без исполнения кода.

Manifest находится в `package.json` пакета под ключом `asmblyr.manifest`.
Действительный пример использует доверенный пакет Comments; корневой проект
должен также указать его в `asmblyr.plugins` и одобрить все заявленные
capabilities:

```json
{
  "name": "@asmblyr-collaborative/plugin-comments",
  "version": "0.0.0",
  "asmblyr": {
    "manifest": {
      "version": 1,
      "namespace": "comments",
      "capabilities": [
        "identity.profile",
        "items.read",
        "collections.manage",
        "storage.own",
        "hooks.items",
        "hooks.collections",
        "settings",
        "notifications"
      ]
    }
  }
}
```

`name` — имя npm-пакета, `version` — semver, `manifest.version` равно `1`.
Поля `title`, `description`, `category` и `publisher: { id, name }`
необязательны и служат только для показа: подтверждение издателя из них не
следует. `compatibility.collaborative` и `compatibility.node` содержат semver
диапазоны. `dependencies` и `optionalDependencies` сопоставляют имена
пакетов диапазонам. Capabilities должны входить в контракт Kit и отдельно
одобряться проектом. Исполняемые entrypoints определяются exports пакета,
а не метаданными manifest. Неизвестные поля блокируют импорт.

## Состояние и жизненный цикл

Административный API использует `/settings/extension-registry`; существующий
`GET /extensions` остаётся маршрутом обнаружения UI-плагинов. Таблица
`asmblyr_extension_states` хранит желаемое включение, а
`asmblyr_extension_history` — время, действие и пользователя без секретов.
Транзакционная advisory lock сериализует изменения всего графа зависимостей.

Поскольку серверный JavaScript нельзя надёжно выгрузить, включение и отключение
действуют после перезапуска Core. До него API явно возвращает
`pendingRestart`. После сверки при запуске API показывает `desiredState` из БД,
`actualState` обслужившего запрос процесса, его `instanceId` и локальную
`lastError`. Ошибки предыдущих процессов остаются в истории с `instance_id`.
Единого фактического состояния кластера нет: при rolling restart разные
реплики могут отвечать по-разному. Для проверки всех реплик обращайтесь к
каждой напрямую. Ошибка manifest, одобрения или импорта фиксируется в истории;
Core продолжает работу с остальными пакетами и пропускает обязательные
зависимые пакеты. Ошибка регистрации уже импортированного плагина всё ещё может
сорвать запуск Core. Отключение не удаляет таблицы и настройки плагина. Установка,
обновление и удаление npm-артефакта остаются действиями доверенного процесса
развёртывания; API не выполняет npm и installation scripts.

## Доступ и граница доверия

Для чтения нужен `plugins/read` или `plugins/update`; изменение состояния
требует `plugins/update`. Пакеты работают с доступом процесса Core и не
изолированы. Недоверенный сторонний пакет можно будет активировать только после
создания отдельной процессной и браузерной изоляции. `worker_threads`, VM и
dynamic import для этого недостаточны. Секретные поля настроек пока не
поддерживаются: текущий editor получает обычные значения, а отдельное внешнее
хранилище секретов ещё не интегрировано.

Будущий изолированный runtime должен принимать проверенный неизменяемый
артефакт и утверждённые capabilities, запускать код вне процесса Core,
предоставлять ограниченный протокол запросов, сообщать о состоянии и
останавливаться без доступа к окружению Core и учётным данным БД. Хост должен
проксировать только разрешённые операции с теми же правами пользователя, что
HTTP и MCP. Для браузерного UI понадобится отдельный origin. Это граница
будущего контракта, а не доступный сейчас runtime.

Диагностика показывает текущую загрузку и результаты проверок, а не
доступность внешних сервисов. Удалённого каталога версий и автоматической
установки пока нет. При ошибке запуска восстановите доверенный пакет или
конфигурацию, выполните миграции и перезапустите Core.

## API

`GET /settings/extension-registry` возвращает постраничный список с параметрами
`page`, `limit`, `search`, `status`, `category`, `sort`. Маршруты
`GET /settings/extension-registry/:id` и вложенные `/versions`,
`/dependencies`, `/permissions`, `/health`, `/history` возвращают подробности.
`POST /settings/extension-registry/:id/enable` и `/disable` меняют желаемое
состояние. `id` — base64url имени пакета из списка. Для чтения нужен
`plugins/read` или `plugins/update`, для изменений — `plugins/update`.
Ошибки: `400` — запрос, `401` — нет входа, `403` — недостаточно прав,
`404` — неизвестный ID, `409` — конфликт зависимостей или разрешений.
Схемы ответов опубликованы в генерируемом OpenAPI.

Для локальной проверки через Docker запустите
`docker run --rm --name collaborative-registry-pg -e POSTGRES_PASSWORD=localtest -p 127.0.0.1:55439:5432 -d postgres:16`,
укажите `TEST_DATABASE_ADMIN_URL=postgresql://postgres:localtest@127.0.0.1:55439/postgres`
и выполните `node scripts/test.mjs core-integration`. Остановите контейнер
командой `docker stop collaborative-registry-pg`. Если Docker недоступен,
запустите локальный PostgreSQL на loopback и задайте тот же URL.
Runner создаёт, мигрирует и удаляет
одноразовую БД `asmblyr_test_*`; production-сервер использовать нельзя.
События `extension.validation.failed`, `extension.enable.requested`,
`extension.disable.requested`, `extension.startup.succeeded`,
`extension.startup.failed` и `extension.reconciliation.completed` пишет
существующий логгер Core.
