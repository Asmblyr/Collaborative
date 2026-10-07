<!-- Generated from packages/sdk/README.md; edit the source. -->

# @asmblyr-collaborative/sdk

Типизированный HTTP-клиент Asmblyr для браузера и Node.js 22+.
Каждая операция вызывает основной API. В пакете нет H3, Knex, PostgreSQL,
компилятора TypeScript или загрузчика плагинов во время исполнения.
Для разработки расширений используется отдельный `@asmblyr-collaborative/kit`.

## Профиль пользователя

Собственный профиль доступен с пользовательским access token. Статус, права,
пароли и системные даты нельзя менять через профиль. Все новые поля необязательны.

```ts
await client.users.updateMe({
  firstName: "Ivan",
  lastName: "Example",
  description: "About me",
});
await client.users.updatePreferences({ timezone: "Asia/Yekaterinburg" });
const { data: me } = await client.users.me();
```

Дополнительные поля потребитель настраивает в обычной UUID-коллекции и выбирает
её в настройках пользователей. `asm connect` / `asm generate` включает её поля
в схему проекта. Для клиента с этой схемой:

```ts
const { data: profile } = await client.users.extension("user_profiles");
await client.users.saveExtension("user_profiles", { bio: "Hello" });
```

`saveExtension` создаёт запись с ID текущего пользователя или обновляет её.
Для первого сохранения нужны `create` и `read`, затем `update` и `read`.
Действуют обычные правила полей и строк, права на связи и файлы. Передайте только
поля сгенерированной схемы; имя коллекции должно совпадать с выбранным расширением.
Скрытые поля могут отсутствовать в результате, а `data` — быть `null`.
После первого сохранения запись и её связи доступны через обычный `client.items`
и fluent API; произвольное создание профиля через `items.create` запрещено.

## Подключение клиента

Личные уведомления доступны через `client.notifications.list()`, `.read(id)` и
`.readAll(result.readBefore)`. Они требуют человеческой сессии; сервисные ключи
не дают доступ к личным входящим. Core хранит последние 200 событий пользователя.

Предварительная версия устанавливается с тегом `beta`:

```sh
npm install @asmblyr-collaborative/sdk@beta
npm install --save-dev @asmblyr-collaborative/cli@beta
```

```ts
import { createClient } from "@asmblyr-collaborative/sdk";

// В браузере: сессия админки остаётся в HttpOnly cookies.
const client = createClient({ baseUrl: "/api" });

const records = await client.items.list("articles", {
  fields: ["id", "title"],
  limit: 20,
  page: 1,
  sort: "title",
  direction: "asc",
});
const record = await client.items.get("articles", 4);
const profile = await client.users.me();
```

`baseUrl` — корень API, например `http://localhost:3001` для прямого доступа
к Core или `http://localhost:3000/api` для браузерной админки. Префикс `/api`
автоматически не добавляется. Путь `/api` без origin работает в браузере.

Для прямых запросов к Core передайте access token:

```ts
const client = createClient({
  baseUrl: "https://asmblyr.example.com/api",
  accessToken: () => currentAccessToken,
  timeoutMs: 10_000,
});
```

`accessToken` может быть строкой или асинхронной функцией. Функция вызывается для
каждого запроса. Поддерживаются access tokens пользователя и сервисного аккаунта;
права проверяет Core. `/users/me` предназначен для пользователя.
SDK не хранит токены в браузере, не выполняет вход и не обновляет токены сам.
В админке браузерная сессия хранится в HttpOnly cookie, которую проверяет Core.

## Реализованные методы

| Метод                                            | HTTP                             | Ответ                      |
| ------------------------------------------------ | -------------------------------- | -------------------------- |
| `items.list(collection, options?, request?)`     | `GET /items/:collection`         | `{ data, labels, page }`   |
| `items.get(collection, id, options?, request?)`  | `GET /items/:collection/:id`     | `{ data, label }`          |
| `users.me(request?)`                             | `GET /users/me`                  | `{ data: CurrentUser }`    |
| `items.create(collection, values, request?)`     | `POST /items/:collection`        | `{ data: row \| null }`    |
| `items.update(collection, id, values, request?)` | `PATCH /items/:collection/:id`   | `{ data: row \| null }`    |
| `items.delete(collection, id, request?)`         | `DELETE /items/:collection/:id`  | `void` (204)               |
| `items.commit(collection, draft, request?)`      | `POST /items/:collection/commit` | `{ data: { id: string } }` |

Остальные системные ресурсы и массовые операции пока не включены.
Прямого доступа к базе данных и переключения actor/superuser нет.

`list` поддерживает `fields`, `page`, `limit`, `sort`, `direction`, `q`, `filter`.
SDK сериализует фильтр и query, Core проверяет значения, права и ограничения.
Фильтр — группа `{ logic: "and" | "or", children: [...] }`, значения условий —
строки или массивы строк. Поиск и фильтры по связям используют правила основного API.
Для списка предел страницы — 100 записей. `page.total` остаётся строкой.
Core дополнительно применяет условия permissions; SDK не передаёт доверенный
контекст. В одной странице условно разрешённые поля могут отсутствовать у части
записей. См. [права и ограничения](../../docs/features/access.md).

Без `fields` выдаются доступные поля. `fields: []` отправляется как `fields=`
и возвращает только первичный ключ. Ключ всегда добавляет Core. Явно выбранное
закрытое поле приводит к 403. Названия коллекций и полей — технические.
Подписи `label`/`labels` могут использовать другие разрешённые поля.

Большие целые ID передавайте строками. SDK отклоняет небезопасные JS-числа.
Строковые ключи кодируются как один сегмент URL; ключи `.` и `..` не поддерживаются,
поскольку HTTP-клиенты нормализуют такие сегменты. Даты HTTP-ответов — ISO-строки,
значения `bigserial` — строки. SDK не преобразует их в `Date` или `number`.

## Запись и сохранение связей

```ts
const created = await client.items.create("articles", { title: "Статья" });
await client.items.update("articles", 4, { title: "Новое название" });
await client.items.delete("articles", 4);

// Одна транзакция для основной записи и связанных изменений.
await client.items.commit("articles", {
  id: "4",
  values: { title: "Статья с категорией" },
  references: { category_id: { values: { title: "Новая категория" } } },
});
```

Core применяет права create/update/delete, ограничения полей, проверки связей,
валидацию и историю изменений. `create`/`update` возвращают только читаемые поля;
`{ data: null }` означает успешную запись без права чтения, а не ошибку.
`delete` разрешается на уровне записи, без списка удаляемых полей.

Каждый вызов — отдельная транзакция. Последовательность `create` и `update`
не становится одной транзакцией. Для черновика со связями используется `commit`:
ошибка откатывает все его изменения и историю. Существующие записи в черновике
требуют права чтения; обычный `update` допускает право записи без чтения.

`ItemCommitDraft` описывает `references`, `relations` (attach/detach/create/links)
и `records` — изменения существующих записей. Core ограничивает черновик
100 изменениями и глубиной 5. `commit` возвращает только ID корневой записи,
в том числе при создании без права чтения. UI-поля preview/label/key не передаются.

Для защиты от перезаписи передайте исходные значения изменяемых полей:

```ts
const previous = await client.items.get("articles", "4");
await client.items.commit("articles", {
  id: "4",
  values: { title: "Моя правка" },
  expectedValues: { title: previous.data.title },
});
```

При несовпадении Core возвращает `ApiError` со `status: 409` и
`code: "ITEM_CHANGED"`; весь commit откатывается. Сохраните локальный черновик,
прочитайте актуальные данные и предложите пользователю выбрать значение.
Автоматически повторять запрос с новым исходным значением нельзя: это заменит
чужую правку. Изменения разных полей не конфликтуют; уже применённое такое же
значение считается успешным. Для вложенных записей задайте их собственные
`expectedValues`, включая обновляемые FK. Проверка требует read/update каждого
сравниваемого поля. Пропуск параметра и обычный `items.update` сохраняют
прежнее безусловное поведение. JSON и массивы сравниваются целиком.

## Участники страницы

```ts
const clientId = crypto.randomUUID(); // одно открытое окно
const scope = { kind: "record", collection: "articles", id: "4" } as const;
const { data } = await client.presence.touch({ clientId, scope });
// data.participants: ID, имя, аватар, число окон, self; data.total
await client.presence.leave(clientId);
```

`touch` продлевает отметку на 30 секунд и возвращает до 50 пользователей;
текущий пользователь идёт первым, окна одного человека объединяются. Повторяйте
вызов, пока окно открыто: этот HTTP API требует самостоятельного таймера.
Realtime API ниже обновляет присутствие сам. SDK сам не создаёт
таймеры. `leave` удаляет только окно текущей человеческой сессии и безопасен при
повторении. До 32 активных окон на одну сессию; превышение возвращает 429.

Область — разрешённая `page`, `collection` либо `record`; каждый `touch` заново
проверяет права просмотра. Пользовательские поля, email, токены и ID сессий не
возвращаются. Сервисные principal не участвуют. При недоступной сети индикатор
может отставать до истечения отметки; присутствие не блокирует запись и не
показывает редактируемое поле.

## Collaborative Live

```ts
const live = client.realtime.connect();
const unsubscribe = live.subscribe(
  { kind: "record", collection: "articles", id: "4" },
  (event) => {
    if (event.type === "record.updated") {
      // Перечитайте запись через items.get; payload не содержит значения полей.
      void client.items.get(event.payload.collection, event.payload.recordId);
    }
  },
);
const offState = live.onState((state) => console.log(state));
const lock = {
  collection: "articles",
  recordId: "4",
  field: "title",
  clientId: crypto.randomUUID(),
};
await live.locks.acquire(lock);
// Пока редактор открыт: await live.locks.refresh(lock) не реже 30 секунд.
await live.locks.release(lock);
unsubscribe();
offState();
live.close();
```

`subscribe` работает для page, collection и record. Состояния — `connecting`,
`connected`, `reconnecting`, `offline`. SDK повторяет подписку с backoff и
jitter. После переподключения он отправляет `collection.changed`, чтобы клиент
перечитал данные. Повторные события с тем же ID в потоке пропускаются. Через
админку используется HttpOnly cookie; внешнему API-клиенту нужен пользовательский
Bearer token. Сервисный ключ для realtime не подходит. Блокировки — временный
UX-сигнал, а `items.commit` с `expectedValues` остаётся защитой записи.

## Типизация коллекций

```ts
interface Schema {
  articles: {
    id: number;
    title: string;
    created_at: string | null;
  };
}

const client = createClient<Schema>({ baseUrl: "/api" });
const result = await client.items.list("articles", {
  fields: ["title"],
  sort: "id",
});
// result.data[0].title: string | undefined
```

TypeScript проверяет имя коллекции, выбор и сортировку полей; возвращаемая
проекция учитывает `fields`. Поля конкретной схемы остаются опциональными:
их наличие зависит от прав. Неявно добавленный первичный ключ не выводится
из имени `id`: у коллекции может быть другой ключ. Чтобы получить его в типе
проекции, перечислите его в `fields`.

Без `Schema` работает динамический режим со словарём JSON-значений.
В своей схеме задавайте `date` как `string` (`YYYY-MM-DD`), обычный `bigint`
как `string` с точным целым значением, а `integer` с вариантами — как `number`
или числовой union. SDK передаёт эти значения без преобразования в `Date`/`Number`.
Связанные пути в фильтрах пока проверяются Core во время запроса.
Схему можно описать вручную или получить из Core через CLI `asm connect`:
подробнее — [генерация типов и fluent-запросы](#generated-types-fluent-queries-and-plugin-methods).
SDK не валидирует структуру ответов во время исполнения; текущие права и
ограничения данных проверяет Core.

При вручную описанной схеме данные `create`/`update` и корневые `values` в `commit` типизируются как
`Partial<Schema[collection]>`: проверяются имена, типы и nullable из вашей схемы.
Обязательность при создании, значения по умолчанию, неизменяемые ключи и системные
поля проверяет Core по метаданным. Тип строки сам по себе их не описывает.
Сгенерированная схема отдельно описывает чтение, создание и обновление, включая
обязательные поля и доступные действия. Вложенные черновики пока используют
JSON-контракт без вывода типов связанных коллекций.

`CurrentUser`, контракты записей, страниц, фильтров и ошибок переэкспортируются
из `@asmblyr-collaborative/contracts`. Core использует этот же пакет. Строки БД, хеши паролей
и внутренние модели Core не являются публичными типами SDK.

## Ошибки и отмена

```ts
import { ApiError } from "@asmblyr-collaborative/sdk";

try {
  await client.items.get("articles", 4, undefined, {
    signal: controller.signal,
  });
} catch (error) {
  if (error instanceof ApiError) {
    console.error(
      error.status,
      error.code,
      error.requestId,
      error.message,
      error.details,
    );
  }
}
```

HTTP-ошибка становится `ApiError`. Ошибки сети и отмены остаются исходными
ошибками `fetch`; локально некорректный путь или ID — `TypeError`.
Таймаут по умолчанию — 10 секунд, включая чтение тела ответа; `timeoutMs: 0`
отключает его. `request.signal` позволяет отменить конкретный запрос.
`request.timeoutMs` переопределяет таймаут одного вызова; редактор админки передаёт
`0` для commit, не ограничивая длительность запроса таймаутом SDK.
SDK не повторяет запросы автоматически и отклоняет HTTP-редиректы.
Ответы запрашиваются с `cache: "no-store"`.

Отмена или ошибка соединения не подтверждает откат уже отправленной записи:
сервер мог успеть сохранить данные. Перед повтором проверьте результат.

Можно передать `fetch`, `headers` и `credentials` для собственного HTTP-окружения.
По умолчанию `credentials: "same-origin"`; SDK не настраивает CORS сервера.
На сервере создавайте клиент для конкретного пользователя/запроса, чтобы не
разделять его токен между пользователями.

## Сборка и проверки

Проверка установки архивов вне workspace: `pnpm packages:check`.
После выпуска `pnpm packages:check --registry` проверяет установку той же версии
из npm без локальных алиасов зависимостей.

```sh
pnpm --filter @asmblyr-collaborative/sdk build
pnpm --filter @asmblyr-collaborative/sdk typecheck
pnpm --filter @asmblyr-collaborative/sdk test
node scripts/test.mjs core-sdk
```

Интеграционный набор запускает Core на временном HTTP-порту с отдельной тестовой
БД и сравнивает SDK с вызовом через kit, включая ограничения прав.

## Переводы

```ts
const { data } = await client.translations.get("en");
console.log(data.core["appearance.ocean"]);
console.log(data.schema.articles?.fields.title?.label);
```

`GET /translations?locale=ru|en` (в админке `/api/translations`) требует
активной сессии или сервисного ключа. Ответ версии 1 содержит язык,
`fallbackLocale: "ru"`, плоский каталог `core`, каталоги активных `plugins`
по namespace и подписи доступной `schema`. Схема использует права каталога
коллекций, включая поля создания/изменения; это не разрешение читать записи.
Ответ не содержит записей, значений по умолчанию или настроек плагинов.
Пропуск языка выбирает русский; неподдержанный язык возвращает 400.

## Generated types, fluent queries and plugin methods

[CLI](./cli-guide.md) connects through the admin browser approval screen, or
uses an API token from the environment/stdin. It saves no credentials:

```sh
pnpm exec asm connect --url https://asmblyr.example.test
pnpm exec asm schema pull
pnpm exec asm generate
pnpm exec asm schema check --offline
```

GET /schema, also client.schema.pull(), exports accessible collection wire types,
effective field permissions, supported filter kinds and generated plugin model
contracts. Defaults, records, secret values and policy conditions are excluded.
Browser approval grants only temporary schema access; runtime requests require a
separate API credential or session. The generated file exports ordinary TS types
and a small browser-safe descriptor. No custom compiler or consumer bundler plugin
is needed. The Node-only generator is isolated in @asmblyr-collaborative/sdk/schema.

JSON fields configured with `interface: "tags"` export as freeform `string[]`
(or `string[] | null` when nullable), without a closed enum. After changing a field
to tags, run `asm schema pull` and `asm generate` to update its generated types.

```ts
import { createClient } from "@asmblyr-collaborative/sdk";
import { schema } from "./asmblyr.schema.js";

const client = createClient({ baseUrl: "/api", schema });
const articles = await client.Articles.select((a) => [a.id, a.title])
  .where((a) => a.status.eq("published").and(a.price.gte("1000.00")))
  .orderBy((a) => a.created_at.desc())
  .limit(20)
  .exec();
// Equivalent collection entry point, with name completion:
const result = await client.collection("articles").limit(10).result();
await client.items.create("articles", { title: "Hello" });
// When the calculator model is installed and accessible:
const calculation = await client.plugins.calculator.calculate(input);
```

The example assumes those fields exist. Aliases derive from technical collection
names, independent of translated labels. Query builders are immutable. where calls
combine with AND; predicates support and/or groups. exec returns rows; result
returns the existing ItemListResult envelope. orderBy supports one field, matching
the Core API. `search("корм")` selects relevance unless a field order was already
explicitly chosen. `orderBy` selects field order; `orderByRelevance()` restores
relevance and keeps the chosen field as a tie-breaker. The low-level list API
accepts `{ q: "корм", order: "relevance" }`, and `page.order` reports the effective
mode. Relevance is calculated by Core before pagination using readable searchable
fields and their configured priority, with exact, word-prefix, whole-word and
substring matches. Without `q`, Core uses field order.

limit accepts 1–100; page and search are also supported. Operators
are suggested according to exported field capabilities. JSON and multiselect
fields do not expose scalar predicates. Older snapshots without filterKind offer
only conservative equality/list operators. Decimal and bigint remain API strings.

Read/Create/Update maps separate required create fields, optional updates,
managed fields and choice unions. Selected responses contain only selected keys;
values remain optional because server permissions can hide fields. Current Core
permissions and row conditions are always checked at runtime. Existing manually
written row schemas and the items client remain supported.

Plugin methods use generated Kit model input/output schemas and the existing
HTTP routes; no additional handler registration is needed. AccessGate filters
contracts in the exported schema, and execution checks current access again.
Legacy actions without output schemas are omitted. The bounded JSON model subset
supports closed objects, arrays, literals, unions and primitives; arbitrary refs,
open objects and defaults are rejected. Personal integration authorization is
checked when calling the method, even if its static contract was exported.

An imported materialized view has sourceKind: "materialized-view" and read-only
actions. Its generated Create/Update are never and delete is unavailable. Fluent
queries, items.list and items.get still work. Core rejects all writes, including
bulk/nested commits by a superuser. SQL creation and refresh remain external.

asm schema check verifies hashes and detects remote contract changes. --offline
compares generated source with the saved snapshot; asm generate recreates source
from it. Names, choices and plugin annotations can disclose project structure;
commit generated files only when appropriate. Npm publication remains a separate
release action. See [package preparation](./packages.md).
