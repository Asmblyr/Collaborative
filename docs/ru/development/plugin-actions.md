<a id="plugin-actions-http-mcp-and-the-assistant"></a>

# Действия плагинов: HTTP, MCP и ассистент

Действующий контракт: file routing H3 v2, типизированная аннотация и один обработчик.
Публичного MCP endpoint пока нет. Инструкции по разработке расширений — в [Kit](../reference/kit-guide.md).

<a id="declaration"></a>

## Объявление

`server/api/calculator/calculate.post.ts`:

```ts
import {
  AccessGate,
  defineHandler,
  defineModelAnnotation,
  defineModelContext,
} from "@asmblyr-collaborative/kit";
import type { CalculationInput } from "../../../shared/calculation.ts";

const annotate = defineModelAnnotation({
  title: "Расчёт стоимости",
  description: "Рассчитать стоимость подписки по параметрам пользователя.",
  middleware: AccessGate.authenticated,
  readOnly: true,
  page: "home",
});

export default defineModelContext<CalculationInput>(
  defineHandler(async (event) => {
    // Core проверил JSON до входа; здесь обычный H3 и предметная логика.
    const input = (await event.req.json()) as CalculationInput;
    return { total: input.users * input.monthlyPrice * input.months };
  }),
  annotate,
);
```

Полный расчёт с копейками и округлением — в
[calculator](https://github.com/Asmblyr/Collaborative/blob/main/examples/plugins/calculator/server/api/calculator/calculate.post.ts).
Пример выше иллюстрирует объявление, не денежную арифметику.

- Путь и метод определяет файл. Model handler требует статический `.post.ts`
  внутри namespace. ID получается из пути после namespace: `calculate`;
  вложенные сегменты соединяются дефисами. Коллизия ID останавливает запуск.
- `plugin.ts` остаётся `definePlugin({})`. Ручной регистрации и отдельного
  `server/actions` нет. Общий `/extensions/:namespace/actions/:action` не используется.
- Обёртка `defineModelContext` явно публикует инструмент; обычные H3 endpoints
  в MCP не видны. Аннотация сохраняется в нативной metadata H3.
- `middleware` сейчас принимает `AccessGate.authenticated` или `AccessGate.superuser`.
  Дополнительную предметную middleware можно указать во внутреннем `defineHandler`.
- `page` — необязательный ID страницы, принимающей подготовленный результат.
  `readOnly` по умолчанию false. Для вычислений указывайте true.
- Старые `defineAction`/`defineActionContract` сохранены как deprecated для совместимости.
  Новый код использует этот API. `bindModelDefinition` предназначен загрузчику Core;
  разработчик плагина его не вызывает.

<a id="generation-and-validation"></a>

## Генерация и валидация

Существующий сборщик плагинов анализирует `<Input>` и возвращаемый тип внутреннего
обработчика **до стирания типов TypeScript**. Результат async разворачивается из
Promise. При желании результат можно явно описать интерфейсом.

Поддержаны строки, числа, boolean, литералы, null, объединения внутри полей,
массивы (включая readonly) и вложенные объекты с известными ключами. Корневые вход
и выход — объекты. Все поля обязательны; отсутствие значения обозначается null.
Лишние ключи запрещены, в том числе во вложенных объектах.

`any`, `unknown`, необязательные свойства, рекурсивные типы, index signatures,
классы, функции, кортежи и не-JSON типы останавливают сборку. Нельзя молча заменить
непонятный тип на разрешение любых данных. Ограничение сложности — 20 уровней и
1000 узлов. У плагина нужен tsconfig; прямой вызов обёртки должен быть default export
или инициализатором экспортированной по умолчанию локальной переменной. Импорт
`defineModelContext` с alias поддержан; произвольные фабрики вокруг него пока нет.

Описания и ограничения свойств задаются в JSDoc:

```ts
export interface CalculationInput {
  /**
   * Количество пользователей.
   * @title Пользователи
   * @integer
   * @minimum 1
   * @maximum 100000
   */
  users: number;
}
```

Обычный комментарий становится description. Поддержаны `@title`, `@description`,
`@integer`, `@minimum`, `@maximum`, `@multipleOf`, `@minLength`, `@maxLength`,
`@minItems`, `@maxItems`. Числовые ограничения применяются к простому типу свойства;
несовместимый тип, неизвестный тег или некорректные границы дают ошибку.

Схемы пишутся в `.asmblyr/models/<путь маршрута>.json` и production route index.
`.asmblyr` исключён из Git. Сборка не заменяет предыдущий dist при ошибке типов
или генерации. Source loader пересоздаёт схемы перед загрузкой обработчиков,
поэтому изменение общего TS-типа подхватывается при dev-перезапуске Core.
Отсутствующая схема у аннотированного обработчика останавливает загрузку.

Core проверяет вход до handler и выход после него. Runtime использует Zod из
сгенерированной JSON Schema. Generic сам по себе не выполняет валидацию без Core.

Форма импортирует JSON и использует `useAction<Input, Output>(model, props, options)`
из `@asmblyr-collaborative/kit/ui/use-action`. `modelField` из `@asmblyr-collaborative/kit/model` возвращает
подпись/описание поля. В tsconfig нужен `resolveJsonModule: true`. Браузер не
импортирует серверный handler или корневой Kit. Для начальной генерации —
`pnpm build:plugins`; `pnpm dev` уже выполняет её перед запуском UI.

<a id="permissions-and-data"></a>

## Права и данные

`AccessGate.authenticated` разрешает вход аутентифицированному пользователю или
сервисному аккаунту. Это не разрешение на коллекции. `AccessGate.superuser`
дополнительно требует superuser; такой инструмент скрыт от остальных при discovery
и повторно проверяется на каждом вызове.

```ts
const items = useItems(event);
await items.update("articles", id, { title });
```

`useItems(event)` — общий API данных для обычных endpoints и model handlers.
Он автоматически использует личность и права текущего запроса: коллекцию, действие,
поля, проверки связей, валидацию и историю Core. Нельзя передать другого actor или
повысить права. HTTP и MCP используют тот же handler и сервис `/items`.
При отказе HTTP возвращает 403, MCP — ошибку `PERMISSION_DENIED` без содержимого
недоступных записей. Сессия и права заново проверяются перед каждым MCP-вызовом.

В MCP есть дополнительное пересечение с публикацией коллекций: `mcp.enabled=false`
закрывает чтение и запись, включая фильтры, поиск, подписи и изменение связей.
Это действует и для superuser. HTTP-права от настройки публикации не меняются.
`readOnly: true` блокирует create/update/delete/commit через items в обоих каналах.
Удаление через MCP также блокируется, если настроенные cascade/setNull/setDefault
могут затронуть отключённую коллекцию, включая цепочку каскадов. Проверка по схеме
консервативна: она не читает скрытые строки и действует даже при пустой дочерней таблице.

`useActionContext(event)` даёт actor, superuser, signal и items. Полный контекст
`useAsmblyr`, привилегированный storage плагина, Knex, токены и cookies не передаются.
Условия прав на строки применяются через общий items API. Пользовательский фильтр запроса не является политикой доступа; плагин не может подменить actor или расширить его grants.

Пакеты выполняются как доверенный серверный код, без песочницы. `readOnly` ограничивает
выданный items, но не может запретить сторонний сетевой клиент, импортированный самим
плагином. MCP hints отражают readOnly; для произвольного кода openWorldHint=true.

<a id="invocation-and-transactions"></a>

## Вызов и транзакции

- Core: `POST /calculator/calculate`.
- UI: `POST /api/calculator/calculate` напрямую в Core с браузерной сессией.
- MCP: `plugin_calculator__calculate`, JSON text и structured content.
- Ответ HTTP: `{ data: { namespace, actionId, input, output } }`.

Handler получает нормализованный POST с проверенным JSON. Исходные auth headers,
cookies и query не передаются. H3 middleware выполняется в обоих каналах.
Response, redirect, streaming, изменение заголовков или статуса не поддерживаются;
возвращается JSON-объект. Обычные endpoints без обёртки сохраняют полный HTTP API.

Каждая запись items и её история транзакционны. Весь произвольный handler одной
транзакцией не является. Для связанного сохранения есть items.commit. Ошибка после
завершённой записи (в том числе в выходной схеме) не отменяет её. После таймаута
нельзя автоматически повторять действие с записью: результат сначала проверяется.

Вызов ограничен 10 секундами, результат — 48 КБ. Отмена прекращает ожидание,
запрещает последующие вызовы items и создание prepared-формы; уже начатую запись
она гарантированно не откатывает. Доверенный handler должен соблюдать signal.

<a id="prepared-forms-and-assistant-results"></a>

## Подготовленная форма и ответ ассистента

Успешное действие с `page` создаёт приватный снимок входа и выхода на 20 минут:
до 32 на пользователя, 256 на установку. Снимки хранятся в PostgreSQL, доступны
всем репликам Core и сохраняются при перезапуске до истечения срока. Значений формы в URL нет.

`GET /extensions/:namespace/drafts/:id` проверяет сессию, владельца, namespace
и доступ к действию. Чужой или истёкший снимок даёт одинаковый 404. При изменении
прав на данные снимок не перечитывается из коллекций: он является результатом уже
выполненного действия владельца, а не новой выдачей данных.

Ассистент объясняет результат в сообщении и вызывает `present_plugin_result` с
ID успешного результата текущего обращения. Появляется кнопка **«Открыть страницу»**;
автоматической навигации нет. Возвращается `requiresUserClick: true`. Поддельный ID
не принимается. Наличие prepared-формы само по себе не доказывает изменение данных.

`useAction` передаёт host dirty/busy, проверяет ID и выходную схему, защищает форму
при переходе из ассистента или замене снимка. Общая защита всех переходов через
меню пока не реализована. Частичные формы и чтение текущих ручных черновиков не
поддержаны. Детальные разрешения на отдельные действия и публичный MCP — позднее.

<a id="change-review"></a>

## Проверка изменений

- File routing и схемы совпадают в source и built. Нет параллельного реестра.
- HTTP/MCP используют один handler, H3 middleware и валидацию входа/выхода.
- Plain endpoints не видны MCP; superuser и отозванные права проверяются при вызове.
- Items защищает действия/поля, MCP-публикацию и связанные коллекции; readOnly блокирует запись.
- Форма использует генерируемую схему без серверных импортов.
- Сохраняются владелец/TTL снимка, защита dirty-формы и кнопка без автоперехода.
- Документация и calculator соответствуют текущему API.

```sh
pnpm build:plugins
pnpm build:examples
node scripts/test.mjs core-plugins
```

Runner создаёт и удаляет отдельную временную PostgreSQL. Интеграционные тесты
нельзя запускать напрямую на базе проекта. Изменения UI также проверяются в браузере.

<a id="personal-connections"></a>

## Личные подключения

Аннотация `connection: "google"` требует активного собственного подключения и одобренной capability `connections.google`. `useActionContext(event).connections.google` даёт ограниченный broker без credentials. `proposeWrite` подготавливает owner-bound предложение; подтверждение реализовано в Core и отсутствует в MCP. Google-плагин остается H3 file routes со схемами из типов; отдельной регистрации инструментов нет. См. [Google Workspace](../features/google-workspace.md).
