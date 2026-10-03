<!-- Generated from packages/kit/UI.md; edit the source. -->

# Общие компоненты UI

Регистрация собственных редакторов полей и их настроек описана в
[FIELDS.md](./kit-fields.md). Они используют эти же компоненты и тему хоста.

Kit содержит исходники общих shadcn-компонентов в `src/ui`. Админка и плагины
импортируют одну реализацию. Компоненты работают без `PluginUiProvider`;
обычные props, события, ref, `asChild` и варианты shadcn доступны напрямую.

```tsx
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
import { Textarea } from "@asmblyr/kit/ui/textarea";
import { Checkbox } from "@asmblyr/kit/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@asmblyr/kit/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@asmblyr/kit/ui/select";
```

`buttonVariants` экспортируется из `@asmblyr/kit/ui/button` для ссылок и других
элементов, которым нужен стиль кнопки. `@asmblyr/kit/ui` содержит регистрацию
плагина и контракты его UI. Серверный entry `@asmblyr/kit` в браузер не импортируется.
React и ReactDOM — совместимые peer dependencies: плагины используют экземпляры
хоста. Серверные потребители Kit не обязаны импортировать UI.

## Стили и сборка

Хост использует Tailwind 4, анимации shadcn и общие переменные темы. В его глобальном
CSS уже подключено:

```css
@import "@asmblyr/kit/ui/styles.css";
```

Этот entry указывает Tailwind на собранные компоненты внутри пакета, поэтому их
классы доступны и из установленного пакета. Плагину повторять импорт не нужно;
его собственные классы хост сканирует через сгенерированный `plugin-ui.css`.
Цвета, радиусы и светлая/тёмная тема принадлежат хосту.

После изменения Kit выполните из корня `pnpm --filter @asmblyr/kit build`.
`pnpm dev` и `pnpm build` также собирают Kit перед приложениями.

## Выпадающие списки внутри нативного dialog

Radix-портал должен находиться в том же диалоге, чтобы не попасть под его backdrop.
В `SelectContent` можно передать `container={dialogElement}`. Для вложенных контролов
есть общий контекст из `@asmblyr/kit/ui/portal-container`:

```tsx
<PortalContainerContext.Provider value={dialogElement}>
  {children}
</PortalContainerContext.Provider>
```

`SelectContent` использует явно указанный контейнер или унаследованный контекст.
Popover админки использует этот же контекст. За пределами диалога контейнер не нужен.

## Изменение и добавление компонентов

Общие Button, Input, Textarea, Select, Checkbox и Tabs меняются в Kit.
Сохраняйте `"use client"` на интерактивных модулях и проверяйте компоненты внутри
нативного диалога. Button и `buttonVariants` остаются доступными серверным компонентам.

`apps/ui/components.json` пока обслуживает остальные локальные компоненты админки.
Не запускайте `shadcn add --overwrite` для уже перенесённых компонентов в `apps/ui`:
это создаст вторую реализацию. При переносе следующего компонента добавьте явный
export в Kit, перенесите необходимые зависимости и замените импорты потребителей.
Импорты внутри Kit не должны зависеть от `@/` или файлов админки.
