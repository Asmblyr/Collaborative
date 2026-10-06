# @asmblyr-collaborative/kit

Типизированный API для описания плагинов Asmblyr.

[Возможности и разрешения](CAPABILITIES.md) · [Hooks и настройки](HOOKS.md)

Плагины также могут предоставлять [редакторы текстовых полей](FIELDS.md)
с настройками и отображением в таблице. Пример — `examples/plugins/color`.

`@asmblyr-collaborative/kit` содержит серверный контекст, H3-обработчики и сборщик плагинов.
HTTP-клиент для браузера и Node находится в отдельном [@asmblyr-collaborative/sdk](../sdk/README.md).
Общие типы запросов и ответов принадлежат `@asmblyr-collaborative/contracts`;
kit переэкспортирует типы, необходимые авторам обработчиков.

Обязательный `plugin.ts` в корне пакета пока остаётся пустым описанием:

```ts
import { definePlugin } from "@asmblyr-collaborative/kit";

export default definePlugin({});
```

Маршруты обнаруживаются по файлам в `server/api`. Перечислять их в `plugin.ts`
не нужно. Дополнительные возможности этого файла определим отдельно.

Тот же принцип действует для ассистента и MCP: `defineModelContext<Input>` связывает
существующий h3-обработчик с `defineModelAnnotation`. Сборщик выводит схемы из типов
TypeScript; описание хранится рядом с обработчиком. Контракт, пример и правила проверки —
в [действиях плагинов](../../docs/development/plugin-actions.md).

## Обработчик

Файл `server/api/comments/status.get.ts`:

```ts
import { defineHandler, useAsmblyr } from "@asmblyr-collaborative/kit";

export default defineHandler((event) => {
  const { actor, logger } = useAsmblyr(event);
  logger.info("Status requested", { actorId: actor.id });
  return { data: { status: "scaffold" } };
});
```

- `defineHandler` — реэкспорт настоящего обработчика H3 **2.0.1-rc.32**. На входе
  `H3Event`; HTTP-утилиты можно импортировать из `h3`, добавив ту же закреплённую
  версию в зависимости своего пакета. H3 v1 с этим контрактом несовместим.
- `useAsmblyr(event)` возвращает проверенный контекст: `actor` (`id`, `kind`,
  необязательный `displayName`), `requestId`, `logger`, `items` и разрешённые возможности пакета.
  `storage` требует namespace и `storage.own`; `displayName` — `identity.profile`. Вызов без контекста Core завершается ошибкой.
  Возможность `notifications` добавляет подписки и публикацию событий своего
  namespace в личные входящие. Core выбирает получателей и проверяет права на запись.
  См. [контракт возможностей](./CAPABILITIES.md).
- Core проверяет access token пользователя или сервисного аккаунта до чтения тела
  и запуска обработчика. Анонимных endpoints нет. `Authorization` в `event.req`
  не передаётся; UI также удаляет свои cookies входа из запроса к плагину.
- Параметры и query читаются функциями H3: `getRouterParam`, `getQuery`,
  `getValidatedQuery`. Для декодирования параметра используйте `{ decode: true }`
  один раз. Тело читается через `event.req.json()`, `.text()`, `.formData()` или
  `readValidatedBody`. Generic-параметр сам по себе не проверяет входные данные.
- Можно возвращать объект, строку, бинарные данные, `Response`, поток или Promise.
  Статус и заголовки задаются через `event.res` либо в `Response`.
  Строка теперь отправляется как текст; для JSON-строки нужен `Response.json(value)`.
  `null`/`undefined` означают пустое тело. Объекты остаются JSON.
- `HTTPError` из H3 поддерживается. Сохранён и `EndpointError` для ошибок с кодом
  Asmblyr. Ошибки имеют общий формат `{ code, message, requestId }`; подробности
  серверных ошибок остаются в журнале. Клиентские HTTPError сохраняют свои headers.
- Вход не означает доступ к данным коллекций. `items` проверяет право нужного
  действия на коллекцию и доступ к её полям через общую с `/items` логику Core.
- `useItems(event)` — общий доступ к этому сервису в обычном endpoint и в model
  handler. В model handler `useActionContext(event)` также даёт actor, superuser и
  signal; полного контекста `useAsmblyr` и привилегированного storage там нет.
  `AccessGate.authenticated` разрешает вход, а права данных проверяет каждый метод
  items. У MCP дополнительно учитывается публикация всех затронутых коллекций.

Это API доверенных серверных пакетов, выполняемых в процессе Core, без песочницы.

## Чтение данных

```ts
import { defineHandler, useAsmblyr } from "@asmblyr-collaborative/kit";

export default defineHandler(async (event) => {
  const { items } = useAsmblyr(event);
  return items.list("articles", {
    fields: ["id", "title"],
    limit: 20,
    page: 1,
    sort: "title",
    direction: "asc",
  });
});
```

Одна запись: `await items.get("articles", 4, { fields: ["title"] })`.
`items` из kit вызывает общий сервис Core внутри процесса, без дополнительного HTTP-запроса.

| Метод                                 | Результат                                                          |
| ------------------------------------- | ------------------------------------------------------------------ |
| `items.list(collection, options?)`    | `{ data, labels, page: { number, size, total, sort, direction } }` |
| `items.get(collection, id, options?)` | `{ data, label }`; отсутствующая запись — ошибка 404               |

Контракты `ItemsReader`, `ItemListOptions`, `ItemReadOptions`, `ItemListResult`,
`ItemResult`, `ItemRecord` и типы фильтров экспортируются из `@asmblyr-collaborative/kit`.

- `collection` и `fields` используют технические имена. Выбор полей относится
  к физическим столбцам, включая внешние ключи и системные даты. Разворачивания
  связанных записей и выбора виртуальных полей через `fields` пока нет.
- Без `fields` возвращаются все доступные поля. `fields: []` возвращает только
  первичный ключ; ключ всегда включён. `*` указывать не нужно. Недоступное поле —
  ошибка 403, неизвестное — 400. Проекция выполняется в SQL.
- Сортировка, поиск и фильтры проверяются по полному набору разрешённых полей,
  независимо от `fields`. Например, можно вернуть только `id`, сортируя по
  доступному `title`. `labels`/`label` тоже могут использовать доступные поля вне
  проекции, но не закрытые поля своей или связанной коллекции.
- `page` начинается с 1, `limit` — от 1 до 100 (по умолчанию 100), `total` — строка.
  Это те же ограничения, что у HTTP API. Без `sort` используется первичный ключ.
- `id` — строка или безопасное целое JS. Большие `bigserial` передавайте строками;
  в результате они также остаются строками. Поля имеют тип `unknown`, поскольку
  схемы динамические. Календарный `date` всегда остаётся строкой `YYYY-MM-DD`,
  обычный `bigint` — точной десятичной строкой. Внутри обработчика `datetime` может быть `Date`;
  при JSON-ответе они сериализуются в ISO-строки, как в `/items`.
- Поддерживаются `q` и объект `filter` с теми же операторами и проверками, что у
  HTTP API. Значения условий — строки или массивы строк, включая числа и boolean.
  Фильтры по связям ограничены одним переходом и требуют прав на обе стороны.
  Действуют общие лимиты: 8192 символа JSON, 3 уровня групп, 20 условий, 30 узлов.
- Права загружаются один раз при входе в endpoint. Изменение политик и отзыв
  сессии/сервисного ключа учитываются в следующем запросе. Не сохраняйте `items`
  в глобальной переменной и не передавайте в фоновые задачи: это контекст запроса.
- Переопределение actor, `superuser` или прав не предусмотрено. Неизвестные опции
  чтения отклоняются. В kit нет доступа к Knex, токенам или системным
  таблицам через `items`. Код плагина остаётся доверенным кодом процесса.
- Условия permissions проверяются Core: до count/пагинации, отдельно от фильтра
  вызывающей стороны. Поля проецируются по сработавшим веткам; изменения проверяют
  исходную и итоговую запись. См. [права и границы первой версии](../../docs/features/access.md).
  Пользовательский `filter` сужает выдачу и не заменяет такую политику.
  Статусы записей автоматически не отфильтровываются: как в `/items`, нужное
  условие передаёт вызывающая сторона.

Пример фильтра по доступному полю связанной коллекции:

```ts
const result = await items.list("articles", {
  fields: ["title"],
  filter: {
    logic: "and",
    children: [{ field: "author_id.name", op: "eq", value: "Анна" }],
  },
});
```

Ошибки чтения проходят через общую обработку Core: 400 — некорректный запрос,
403 — нет разрешения, 404 — коллекция или запись не найдена. До запуска endpoint
невалидный access token даёт 401. Ошибка не превращается в пустую выдачу.

HTTP API использует ту же проекцию: `GET /items/articles?fields=id,title` и
`GET /items/articles/4?fields=title`. Без параметра формат ответа сохранён.

## Запись данных

```ts
const { items } = useAsmblyr(event);
const result = await items.create("articles", { title: "Статья" });
await items.update("articles", 4, { title: "Новое название" });
await items.delete("articles", 4);
```

Контекст предоставляет `ItemsService`, включающий чтение и запись. `ItemsReader`
остаётся отдельным типом для функций, которым требуется только чтение.
Входные значения — JSON-объекты; правила полей и отношений проверяет Core.

- `create`/`update` возвращают `{ data }` только с читаемыми полями. Если права
  чтения нет, успешный результат — `{ data: null }`. `delete` возвращает `void`.
- Core использует общую с HTTP API логику в `items/writer.ts`: права, проверку
  связанной коллекции, валидацию, запись и проекцию результата.
- Каждая операция и её история выполняются в транзакции. Автор истории берётся
  из текущей сессии пользователя или сервисного аккаунта. ID операции истории
  генерирует Core; это UUID, отдельный от HTTP `requestId`.
- Несколько вызовов не образуют одну транзакцию. Для записи со связями есть
  `items.commit(collection, draft)`, использующий существующий механизм черновиков.
  Возвращает `{ data: { id } }`. Сбой откатывает весь черновик, включая историю.
- `ItemCommitDraft` содержит values/references/relations/records, до 100 изменений
  и глубины 5. Для изменения существующей записи через commit нужно и чтение.
  `expectedValues` в каждой изменяемой записи включает исходные значения всех
  обновляемых полей, включая FK. Core проверяет их под блокировкой строки;
  несовпадение возвращает `ITEM_CHANGED` (409) и откатывает весь черновик.
  Сравниваемые поля требуют read/update. Пропуск сохраняет прежнее поведение.
  Полный формат общий с [HTTP SDK](../sdk/README.md#запись-и-сохранение-связей).
- Ошибки: 400 — значения или поля, 403 — права, 404 — отсутствующая запись,
  409 — конфликт связи/ключа или вторая запись в single-коллекции.

Собственные коллекции плагина устанавливаются Core при первом запуске.
Формат описания и ограничения обновления приведены ниже.

### Пример POST с проверкой тела

```ts
import { defineHandler, useAsmblyr } from "@asmblyr-collaborative/kit";
import { readValidatedBody } from "h3";

export default defineHandler(async (event) => {
  const body = await readValidatedBody(event, (value: unknown) => {
    if (!value || typeof value !== "object" || !("text" in value)) return false;
    if (typeof value.text !== "string" || !value.text.trim()) return false;
    return { text: value.text.trim() };
  });
  return { data: { text: body.text, actorId: useAsmblyr(event).actor.id } };
});
```

### Граница HTTP

Fastify продолжает маршрутизировать запросы. Изолированный parser читает исходные
байты тела с лимитом **1 МиБ**; H3 разбирает их один раз. Multipart поддерживается
в этом лимите, потоковая загрузка больших файлов пока не реализована.
Ответы идут потоком через Fastify и UI без преобразования в JSON и без полной
буферизации. Отключение клиента передаётся в `event.req.signal`.

UI сохраняет content-type, статусы, cookies плагина и end-to-end headers.
Cookies `asmblyr_access`/`asmblyr_refresh` зарезервированы; плагин не заменяет ими
сессию UI. Редирект передаётся браузеру, прокси не следует за ним с токеном Core.
В `Location` следует использовать публичный адрес, например `/api/comments/status`.
Сохраняется текущий таймаут прокси **10 секунд**, включая чтение ответа.
Все ответы плагинов имеют `Cache-Control: no-store`.

Это интеграция обработчиков H3, а не полноценный Nitro-сервер. `event.app`,
сырой Node req/res, WebSocket upgrades и фоновый lifecycle пока не предоставляются.
`plugin.ts` по-прежнему описывает пакет Asmblyr; `definePlugin` из `h3` — другое API.

## Адреса

Путь определяется относительно `server/api`, метод — суффиксом файла:

| Файл внутри `server/api`             | Публичный маршрут на адресе админки |
| ------------------------------------ | ----------------------------------- |
| `comments/index.get.ts`              | `GET /api/comments`                 |
| `comments/index.post.ts`             | `POST /api/comments`                |
| `comments/[id].delete.ts`            | `DELETE /api/comments/:id`          |
| `comments/[id]/replies/index.get.ts` | `GET /api/comments/:id/replies`     |

Core использует те же пути без общего префикса `/api`. Имя npm-пакета в URL не
подставляется. Поддерживаются `.get.ts`, `.post.ts`, `.put.ts`, `.patch.ts` и
`.delete.ts`. Файл без суффикса метода, например `comments/status.ts`, обслуживает
все пять методов. Каждый файл должен экспортировать обработчик по умолчанию.

Вспомогательные функции размещаются вне `server/api`. Файлы `.d.ts` не считаются
маршрутами. Необязательные параметры, catch-all, составные параметры в сегменте
и отдельные HEAD/OPTIONS handlers пока не поддерживаются.

Первый сегмент пути принадлежит плагину. Core отклоняет пересечения с собственными
разделами, другими плагинами и дубли маршрутов. Сборка также отклоняет неоднозначные
файлы, например `[id].get.ts` и `[key].get.ts` в одном каталоге.
UI автоматически проксирует пути плагинов, используя
свою сессию и существующую проверку Origin для изменений.

## Коллекции плагина

В `server/collections/entries.ts` плагина comments есть пример с
`defineCollection()` из kit. Core проверяет описание и при первом запуске создаёт
таблицу вместе с метаданными. Файлы лежат непосредственно в `server/collections`,
имя файла совпадает с локальным именем коллекции. Подкаталоги и симлинки запрещены.

```ts
import { defineCollection } from "@asmblyr-collaborative/kit";

export default defineCollection({
  name: "entries",
  primaryKey: { name: "id", type: "uuid" },
  timestamps: { createdAt: true, updatedAt: true },
  presentation: { displayName: "Комментарии", hidden: true },
  fields: {
    body: {
      type: "text",
      required: true,
      nullable: false,
      presentation: { label: "Комментарий", interface: "textarea" },
    },
  },
});
```

- `name` — локальное имя внутри плагина. Namespace задаётся в манифесте,
  а Core формирует имя таблицы: `plugin_<namespace>_<name>`, например `plugin_comments_entries`.
- `primaryKey` и `timestamps` используют общие с Core типы из contracts.
  Ключ и системные даты не нужно повторять в `fields`.
- Ключи объекта `fields` — технические имена полей. Порядок объявления задаёт
  порядок создания столбцов. Метаданные полей сохраняются при установке.
- `required` — обязательность непустого значения в API; `nullable` — допустимость
  SQL NULL в БД. Оба параметра явные и независимые: `true` / `true` допустимо.
- Типы полей соответствуют Core. Тип значения `defaultValue` зависит от поля;
  `date` и `bigint` используют строки, включая `CollectionRow` и входы storage.
  для `file` / `files` дефолт не поддерживается. `searchable` доступен для `text`
  и `email`; создание индекса это свойство не описывает.
- `presentation` поля использует существующий `FieldPresentation` из contracts;
  можно указать только нужные настройки. У коллекции пока доступны `displayName`
  и `hidden`. Скрытие из навигации не заменяет права или защиту структуры.
- `defineCollection` возвращает описание без побочных действий. Это не runtime-
  валидатор: допустимость имён, UUID/дат/чисел, сочетаний настроек интерфейса и
  конфликтов полей проверяет загрузчик Core через общие валидаторы коллекций.

Пакет с коллекциями задаёт `asmblyr.manifest.namespace`, например `comments`,
и экспортирует `"./collections": "./dist/collections.json"`. Namespace — стабильное
имя из 1–31 строчных латинских букв, цифр и подчёркиваний, начиная с буквы.
Он уникален между установленными пакетами; `asmblyr` и префиксы `asmblyr_` / `plugin_`
зарезервированы. Полное имя таблицы должно умещаться в 63 символа PostgreSQL.
Сборщик создаёт индекс деклараций. В dev Core сканирует исходники локального пакета,
в production читает индекс и скомпилированные модули. `plugin.ts` остаётся пустым.

Core хранит namespace и npm-владельца в `asmblyr_plugins`, а локальное имя,
физическое имя и нормализованное описание — в `asmblyr_plugin_collections`.
Реестр создаётся обычной миграцией Core (`pnpm db:migrate`). При старте установка
всех включённых коллекций проходит в одной транзакции под общей блокировкой.
Чужие таблицы и метаданные не присваиваются. Повторный запуск сохраняет данные.

Изменения установленного описания должны быть воспроизведены явными миграциями
из `server/migrations`. Несовпадение итогового описания останавливает запуск.
Новые коллекции добавляются автоматически. Исчезнувшая
таблица не создаётся заново поверх реестра. Прямые изменения структуры через SQL
не синхронизируются автоматически. Отключение плагина сохраняет таблицы и владельца.

Префикс `plugin_` зарезервирован в редакторе структуры и API независимо от того,
включён ли пакет. Обычные пользователи и superuser не меняют структуру и настройки
таких коллекций. Строки доступны через `/items` и kit по обычным правам, включая
историю изменений; отключение кода плагина само по себе эти права не отзывает.
MCP при установке выключен. Связи между коллекциями плагина пока не поддержаны
декларациями. Формат пока экспериментальный.

## Миграции, хранилище и UI

Полный контракт и ограничения описаны в [жизненном цикле плагина](./LIFECYCLE.md).
Пример со всеми тремя возможностями — `packages/plugin-comments`.

## Пакет и подключение

Имя, версия и зависимости плагина остаются в его `package.json`.
`asmblyr.manifest.version` задаёт версию формата манифеста, а не версию kit.

Пакет плагина экспортирует собранный модуль по `exports["."].default`, типы по
`exports["."].types`, метаданные по `exports["./package.json"]` и сгенерированный
`dist/routes.json` по `exports["./routes"]`. Пакеты с namespace также экспортируют
`dist/collections.json` по `exports["./collections"]`.
Пример настройки находится в `packages/plugin-comments/package.json`.

Пакеты устанавливаются как зависимости корневого проекта и явно включаются
в его `package.json`:

```json
{
  "asmblyr": {
    "plugins": ["@asmblyr-collaborative/plugin-comments"]
  }
}
```

Core проверяет имена, версии манифестов и наличие обработчиков всех включённых
пакетов перед импортом. Ошибки включённого плагина останавливают запуск.
Сканирование происходит только внутри включённых пакетов; установка сама по себе
не включает плагин.

## Разработка и сборка

В разработке `pnpm dev` использует исходники включённых локальных пакетов из
workspace-пакетов внутри проекта. Изменение, добавление и удаление `.ts`-файлов автоматически перезапускает
Core и обновляет маршруты. Это перезапуск процесса, а не замена обработчика на лету.

Сборка плагина выполняется командой kit `asmblyr-plugin build` в каталоге пакета;
в comments она задана в script `build`. TypeScript использует `rootDir: "."`,
`outDir: "dist"`, включая `plugin.ts` и `server/**/*.ts`.
Для типов Web API добавлены `DOM` и `DOM.Iterable` в `lib`. В kit и примере включён
`skipLibCheck`: декларации выбранной RC содержат несовместимости с TypeScript 5.9
и ссылки на опциональные зависимости. Проверка собственного кода остаётся строгой;
при обновлении H3 это ограничение нужно пересмотреть.
Сборщик проверяет имена маршрутов, default exports и типы, очищает собственный
`dist`, создаёт JavaScript, декларации типов и список маршрутов `dist/routes.json`.

В production и для установленных npm-пакетов Core читает готовый список и загружает
JavaScript. Сканирования исходников в этом режиме нет. Удалённые исходные маршруты
не сохраняются в следующей сборке.

В репозитории Kit и comments связаны как workspace-пакеты. `pnpm build:plugins` собирает оба;
`pnpm dev` выполняет начальную сборку автоматически. `pnpm build` сначала собирает
пакеты, затем Core и UI. Публикация пакетов остаётся отдельным шагом.

Проверка kit и первого плагина из корня репозитория:

```sh
pnpm build:plugins
pnpm --filter @asmblyr-collaborative/kit --filter @asmblyr-collaborative/plugin-comments typecheck
```

## Локализация расширения

Необязательные плоские JSON-каталоги `locales/ru.json` и `locales/en.json`
располагаются рядом с `package.json`. Включайте `locales/` в опубликованный пакет
вместе с `dist/`. Core читает их одинаково в source и built режиме и добавляет
в защищённый `GET /translations`. Каталоги содержат только публичные подписи: не
добавляйте в них настройки, ключи или пользовательские данные.

UI использует тот же каталог через `defineUiPlugin({ translations: { ru, en }, ... })`.
Для JSON-импортов включите `resolveJsonModule` в tsconfig. У страниц, панелей
и интерфейсов поля можно указать `titleKey`; `title` остаётся запасной подписью.

```tsx
import { usePluginTranslations } from "@asmblyr-collaborative/kit/ui/i18n";

function Panel() {
  const { t, locale } = usePluginTranslations("comments");
  return <p>{t("panel.title", "Discussion")}</p>;
}
```

Хост предоставляет изолированный i18next provider на текущем языке профиля,
пространство имён `plugin.<manifest.namespace>` и русский fallback. React
экранирует текст при отображении. Не импортируйте серверный entry point в UI.
Ключи `collection.<local-name>.label` и
`field.<local-name>.<field>.label|description|placeholder` задают подписи
собственных таблиц в UI и API. Для настроек используются `settings.title`,
`settings.description` и `settings.<field>.label|description`.
Имена коллекций/полей, значения записей и HTTP-контракты не переводятся.

## Личные внешние подключения

Model handler с `connection: "google"` в `defineModelAnnotation` виден ассистенту только при активном подключении текущего человека. Пакет запрашивает capability `connections.google`, установка явно одобряет её в `asmblyr.pluginPermissions`.

`useActionContext(event).connections?.google` предоставляет owner-bound операции `list`, `readText`, `sheet`, `cells`, `proposeWrite`. Контракты `PersonalConnections`, `GoogleWriteInput`, `GoogleFileList`, `GoogleText`, `GoogleSheet`, `GoogleCells` экспортируются Kit. Нет raw token, произвольного URL или метода подтверждения. `proposeWrite` только сохраняет предложение; реальную запись подтверждает человек в UI Core. HTTP и внутренний MCP используют одинаковый handler. Пример — `packages/plugin-google-workspace`; ограничения и настройка — [Google Workspace](../../docs/features/google-workspace.md).

## SDK consumer contracts

Built defineModelContext handlers include generated JSON input/output schemas.
Core exports accessible handlers through GET /schema, using their existing
AccessGate and original HTTP address. The generated SDK provides
`client.plugins.namespace[methodId](input)` with inferred output. Method IDs join
route segments with hyphens. No extra SDK handler or registry is needed.

Contracts describe Kit's bounded JSON model subset. They do not grant data access
or imply that a personal OAuth connection is available. Execution still runs the
original gate and current Core permissions. Legacy defineAction handlers without
a generated outputSchema do not appear in the typed consumer API.

[Package checks and release preparation](../../docs/reference/packages.md).
