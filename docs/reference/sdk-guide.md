<!-- Generated from packages/sdk/README.md; edit the source. -->

# @asmblyr/sdk

Типизированный HTTP-клиент Asmblyr для браузера и Node.js 22+.
Каждая операция вызывает основной API. В пакете нет H3, Knex, PostgreSQL,
компилятора TypeScript или загрузчика плагинов во время исполнения.
Для разработки расширений используется отдельный `@asmblyr/kit`.

## Подключение

```ts
import { createClient } from "@asmblyr/sdk";

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
к Core или `http://localhost:3000/api` для прокси админки. Префикс `/api`
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
В админке обновление сессии остаётся задачей её существующего серверного прокси.

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
вызов, пока окно открыто: админка делает это каждые 5 секунд. SDK сам не создаёт
таймеры. `leave` удаляет только окно текущей человеческой сессии и безопасен при
повторении. До 32 активных окон на одну сессию; превышение возвращает 429.

Область — разрешённая `page`, `collection` либо `record`; каждый `touch` заново
проверяет права просмотра. Пользовательские поля, email, токены и ID сессий не
возвращаются. Сервисные principal не участвуют. При недоступной сети индикатор
может отставать до истечения отметки; присутствие не блокирует запись и не
показывает редактируемое поле.

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
Связанные пути в фильтрах пока проверяются Core во время запроса.
Генерации схемы из сервера и проверки структуры ответов во время исполнения
пока нет; TypeScript-схему предоставляет вызывающее приложение.

Данные `create`/`update` и корневые `values` в `commit` типизируются как
`Partial<Schema[collection]>`: проверяются имена, типы и nullable из вашей схемы.
Обязательность при создании, значения по умолчанию, неизменяемые ключи и системные
поля проверяет Core по метаданным. Тип строки сам по себе их не описывает.
Вложенные черновики пока используют JSON-контракт без вывода типов связанных коллекций.

`CurrentUser`, контракты записей, страниц, фильтров и ошибок переэкспортируются
из `@asmblyr/contracts`. Core использует этот же пакет. Строки БД, хеши паролей
и внутренние модели Core не являются публичными типами SDK.

## Ошибки и отмена

```ts
import { ApiError } from "@asmblyr/sdk";

try {
  await client.items.get("articles", 4, undefined, {
    signal: controller.signal,
  });
} catch (error) {
  if (error instanceof ApiError) {
    console.error(error.status, error.code, error.requestId, error.message);
  }
}
```

HTTP-ошибка становится `ApiError`. Ошибки сети и отмены остаются исходными
ошибками `fetch`; локально некорректный путь или ID — `TypeError`.
Таймаут по умолчанию — 10 секунд, включая чтение тела ответа; `timeoutMs: 0`
отключает его. `request.signal` позволяет отменить конкретный запрос.
`request.timeoutMs` переопределяет таймаут одного вызова; редактор админки передаёт
`0` для commit, сохраняя действующий таймаут серверного прокси.
SDK не повторяет запросы автоматически и отклоняет HTTP-редиректы.
Ответы запрашиваются с `cache: "no-store"`.

Отмена или ошибка соединения не подтверждает откат уже отправленной записи:
сервер мог успеть сохранить данные. Перед повтором проверьте результат.

Можно передать `fetch`, `headers` и `credentials` для собственного HTTP-окружения.
По умолчанию `credentials: "same-origin"`; SDK не настраивает CORS сервера.
На сервере создавайте клиент для конкретного пользователя/запроса, чтобы не
разделять его токен между пользователями.

## Сборка и проверки

Пакет пока приватный workspace-пакет, публикации в npm нет.

```sh
pnpm --filter @asmblyr/sdk build
pnpm --filter @asmblyr/sdk typecheck
pnpm --filter @asmblyr/sdk test
node scripts/test.mjs core-sdk
```

Интеграционный набор запускает Core на временном HTTP-порту с отдельной тестовой
БД и сравнивает SDK с вызовом через kit, включая ограничения прав.
