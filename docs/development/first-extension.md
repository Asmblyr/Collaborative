# Первое расширение

Этот путь использует работающие примеры [overview](https://github.com/Asmblyr/Collaborative/tree/main/examples/plugins/overview)
(страница и HTTP endpoint) и [calculator](https://github.com/Asmblyr/Collaborative/tree/main/examples/plugins/calculator)
(действие для ассистента). Примеры не включены в обычную установку.
Начните с [локального запуска](../guide/getting-started.md).

## 1. Создайте пакет

Для собственного workspace-пакета, например `@asmblyr-collaborative/plugin-hello`, используйте
`examples/plugins/hello`:
`pnpm-workspace.yaml` включает этот каталог. Удобная отправная точка — исходники
`examples/plugins/overview`, без копирования `dist` и `.asmblyr`. Переименуйте
`name` в `package.json` и `asmblyr.manifest.namespace`; для нового namespace
переименуйте первый каталог в `server/api/<namespace>`. Namespace должен быть
уникальным и совпадать с первым сегментом HTTP-пути. Сохраните exports для
корневого entry, `./routes`, `./collections`, `./package.json` и `./ui`, script
`"build": "asmblyr-plugin build"`, TypeScript-конфигурацию и зависимости Kit/H3.
Версия манифеста сейчас `1`. [Пакет overview](https://github.com/Asmblyr/Collaborative/blob/main/examples/plugins/overview/package.json)
показывает полный рабочий manifest.

Обязательный `plugin.ts` минимален:

```ts
import { definePlugin } from "@asmblyr-collaborative/kit";

export default definePlugin({});
```

Маршруты, страницы и model handlers здесь вручную не регистрируются.

## 2. Добавьте серверный обработчик

После переименования namespace файл `server/api/hello/session.get.ts` определяет
`GET /hello/session`. Сохраните тело обработчика overview и общий тип ответа:

```ts
import { defineHandler, useAsmblyr } from "@asmblyr-collaborative/kit";
import type { Overview } from "../../../shared/overview.js";

export default defineHandler((event): Overview => {
  const { actor } = useAsmblyr(event);
  return {
    viewer: {
      id: actor.id,
      kind: actor.kind,
      displayName: actor.displayName ?? null,
    },
    checkedAt: new Date().toISOString(),
  };
});
```

Это адаптация [обработчика overview](https://github.com/Asmblyr/Collaborative/blob/main/examples/plugins/overview/server/api/overview/session.get.ts).
Core требует аутентификацию до вызова обработчика. Для записей используйте
`useAsmblyr(event).items` или `useItems(event)`: методы применяют права вызывающего.
`actor.displayName` требует заявленной capability `identity.profile` и
отдельного одобрения проекта. Одно лишь имя в manifest доступа не даёт.
Обработчики с записью проверяют предметные права и валидируют вход.

## 3. Добавьте страницу

`ui/index.ts` — отдельный браузерный entry; он не импортирует `plugin.ts` или
серверные файлы:

```ts
"use client";

import { defineUiPlugin } from "@asmblyr-collaborative/kit/ui";
import { OverviewPage } from "./pages/overview-page.tsx";

export default defineUiPlugin({
  pages: [{ id: "home", title: "Обзор", component: OverviewPage }],
});
```

В компоненте `request("/session")` из `PluginPageProps` вызывает namespace endpoint
через BFF и текущую сессию. Рабочие компонент и hook есть в
[overview](https://github.com/Asmblyr/Collaborative/tree/main/examples/plugins/overview/ui).
После подключения страница появляется по адресу
`/extensions/hello/home`. Отдельных прав на UI-страницу пока нет:
серверный endpoint сам должен проверять доступ к своим данным. Для вкладок записи
и редакторов полей смотрите [Kit UI](../reference/kit-ui.md) и
[поля](../reference/kit-fields.md).

## 4. Подключите пакет и права

Добавьте пакет в корневые `dependencies` или `devDependencies` через
`"@asmblyr-collaborative/plugin-hello": "workspace:*"`, выполните `pnpm install` и включите
его в корневом `package.json`:

```json
{
  "asmblyr": {
    "plugins": ["@asmblyr-collaborative/plugin-hello"],
    "pluginPermissions": {
      "@asmblyr-collaborative/plugin-hello": ["identity.profile"]
    }
  }
}
```

Это **фрагмент**, не замена существующего блока: сохраните встроенные
`plugin-comments` и `plugin-google-workspace` с их разрешениями. Скопированный
manifest overview уже заявляет `identity.profile`;
в примере выше проект отдельно одобряет её для нового пакета. Отсутствующее
одобрение означает отсутствие
возможности. Серверные пакеты выполняются в процессе Core как доверенный код;
capabilities не создают песочницу. [Точный контракт](../reference/kit-capabilities.md).

## 5. Опубликуйте действие для ассистента, если нужно

Обычный H3 endpoint доступен по HTTP, но не появляется во внутреннем MCP.
Для model handler используйте `defineModelContext<Input>` вокруг того же
`defineHandler`, задайте `defineModelAnnotation({ title, description,
middleware: AccessGate.authenticated, readOnly: true })`. Модельный обработчик
должен быть статическим `.post.ts` маршрутом. Kit выведет схемы входа/выхода из
TypeScript; неподдерживаемые типы остановят сборку. Рабочий код с UI-формой —
[calculator](https://github.com/Asmblyr/Collaborative/blob/main/examples/plugins/calculator/server/api/calculator/calculate.post.ts).
Права на данные `AccessGate` не заменяет; внутри используйте `useItems(event)`.
Принцип вызова и ограничения описаны в [архитектуре ассистента](./assistant-architecture.md)
и [контракте действий](./plugin-actions.md).

## 6. Проверьте и соберите

```sh
pnpm --filter @asmblyr-collaborative/plugin-hello build
pnpm --filter @asmblyr-collaborative/plugin-hello typecheck
pnpm dev
```

Имя фильтра замените реальным именем пакета. Перезапустите Core и UI после
изменения списка плагинов. Войдите в админку, откройте
`/extensions/hello/home` и проверьте запрос страницы. Для отдельного
примерного набора из репозитория доступны `pnpm build:examples` и
`node scripts/test.mjs core-plugins` с одноразовой БД.

Перед выпуском запускайте `pnpm build`: production loader читает собранный
`dist/routes.json`, а UI — отдельный `./ui` entry. `dist` и `.asmblyr` не включайте
в Git. Собственные коллекции, миграции, hooks и настройки разбираются в
[Kit lifecycle](../reference/kit-lifecycle.md) и [Kit hooks](../reference/kit-hooks.md).
