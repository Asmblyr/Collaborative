# @asmblyr-collaborative/cli

<!-- languages -->

[English](README.md) · [Русский](README.ru.md)

<!-- /languages -->

Подключает TypeScript-проект к Collaborative и генерирует типы коллекций/плагинов
по доступу вошедшего пользователя. Нужен Node.js 22+. Установите CLI рядом с SDK:

```sh
npm install @asmblyr-collaborative/sdk@beta
npm install --save-dev @asmblyr-collaborative/cli@beta
npx asm connect --url https://asmblyr.example.test
```

В репозитории соберите пакеты и используйте workspace-команду:

```sh
pnpm build:packages
pnpm exec asm connect --url https://asmblyr.example.test
pnpm exec asm schema pull
pnpm exec asm generate
pnpm exec asm schema check
pnpm exec asm schema check --offline
```

Без credentials сетевые команды открывают вход и согласие в админке. Можно указать
корень Core API, UI или UI /api; CLI при необходимости обнаружит API.
С --no-browser откройте показанный URL самостоятельно. Согласие выдаёт schema:read
на 10 минут, с привязкой к человеческой сессии и PKCE S256. Читать/изменять записи
оно не позволяет. Токен остаётся только в памяти команды; следующий онлайн-вызов
снова требует согласия. Отзыв сессии отзывает доступ. AUTH_UI_URL должен указывать
на доступный origin админки.

Для CI используйте ASMBLYR_ACCESS_TOKEN или --token-stdin и явный Core API/UI /api.
Credentials не сохраняются в генерируемых файлах. Требуется HTTPS, кроме localhost;
HTTP-редиректы отклоняются.

Команды расширений используют API реестра и требуют явный пользовательский токен
с правом `plugins/read` или `plugins/update`. Токен браузерного согласия с
`schema:read` для них не подходит. Выполните `asm extensions list`, затем
`asm extensions info <id>` с полученным ID. Команды
`asm extensions enable <id> --yes` и `asm extensions disable <id> --yes`
сохраняют желаемое состояние; для применения нужен перезапуск Core. CLI не
устанавливает, не обновляет и не удаляет npm-пакеты.

Connect создаёт asmblyr.config.json, asmblyr.schema.json и asmblyr.schema.ts,
не перезаписывая существующие файлы. Schema pull обновляет подключение.
--config, --schema-file и --types-file выбирают относительные пути проекта.
Asm generate (также asm schema generate) пересоздаёт TypeScript по проверенному
хешем снимку без сети и токенов.

```ts
import { createClient } from "@asmblyr-collaborative/sdk";
import { schema } from "./asmblyr.schema.js";

const client = createClient({
  baseUrl: "https://asmblyr.example.test",
  accessToken: process.env.ASMBLYR_ACCESS_TOKEN,
  schema,
});
const articles = await client.Articles.select((a) => [a.id, a.title])
  .where((a) => a.status.eq("published").and(a.price.gte("1000.00")))
  .orderBy((a) => a.created_at.desc())
  .limit(20)
  .exec();
```

Пример предполагает наличие указанных коллекций/полей. Рабочий клиент использует
отдельные API-креды или браузерную сессию, а не schema-токен CLI.
Read/Create/Update различают обязательные, readonly-поля и закрытые варианты.
Псевдонимы выводятся из технических имён: articles → Articles.
Collection("articles") тоже поддерживает подсказки. Проекция содержит выбранные
поля; значения остаются optional из-за прав. Decimal/bigint и даты передаются
строками API. Особый TS-трансформер или плагин сборщика не нужен.

Kit model handlers дают методы вроде client.plugins.calculator.calculate(input),
вызывающие исходный HTTP handler. Core проверяет схемы и AccessGate; при вызове
может потребоваться личное OAuth-подключение. Старые действия без выходной схемы
пропускаются. Браузерные типы/клиент не импортируют Node-only генератор.

Schema check завершится с кодом 1 при изменении удалённой схемы или типов.
--offline сверяет сохранённый снимок и исходник. Снимок содержит доступные типы,
права и JSON-контракты плагинов, без defaults, условий политик, записей и секретов.
Имена, варианты и аннотации тоже могут быть приватными: публикуйте их только при
допустимости для проекта. Генерируйте с тем же доступом, что у рабочего клиента.
Актуальные права и условия строк всегда проверяет Core.

[SDK](../sdk/README.ru.md) · [Подготовка пакетов](../../docs/ru/reference/packages.md).
