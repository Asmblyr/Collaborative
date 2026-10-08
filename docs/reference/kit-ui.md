<!-- Generated from packages/kit/UI.md; edit the source. -->

<a id="общие-компоненты-ui"></a>

# Shared UI components

[Field editors](kit-fields.md) use these same components and host theme.

Kit owns shared shadcn sources under src/ui. Admin and plugins import one implementation. Components need no PluginUiProvider; ordinary props, events, refs, asChild, and shadcn variants work directly.

```tsx
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Textarea } from "@asmblyr-collaborative/kit/ui/textarea";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@asmblyr-collaborative/kit/ui/tabs";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@asmblyr-collaborative/kit/ui/select";
```

`buttonVariants` from kit/ui/button styles links and other elements. `kit/ui` contains plugin registration/UI contracts. Never import the server root into browsers. React/ReactDOM are compatible peer dependencies shared with the host. Server consumers need not import UI.

<a id="стили-и-сборка"></a>

## Styles and build

The host uses Tailwind 4, shadcn animations, and shared theme variables. Global CSS already imports:

```css
@import "@asmblyr-collaborative/kit/ui/styles.css";
```

This entry points Tailwind at built package components. Plugins need not repeat it; generated plugin-ui.css includes their own classes. Colors, radii, and light/dark themes belong to the host.

After Kit changes run pnpm --filter @asmblyr-collaborative/kit build. Pnpm dev/build also builds Kit first.

<a id="выпадающие-списки-внутри-нативного-dialog"></a>

## Dropdowns inside native dialogs

Radix portals must stay inside the dialog to appear above its backdrop. Pass container={dialogElement} to SelectContent or use the shared kit/ui/portal-container context:

```tsx
<PortalContainerContext.Provider value={dialogElement}>
  {children}
</PortalContainerContext.Provider>
```

SelectContent uses an explicit container or inherited context. Admin popovers share it. No container is needed outside dialogs.

<a id="изменение-и-добавление-компонентов"></a>

## Changing or adding components

Change shared Button, Input, Textarea, Select, Checkbox, and Tabs in Kit. Keep "use client" on interactive modules and check native-dialog behavior. Button/buttonVariants remain usable from server components.

Apps/ui/components.json still manages other local components. Do not run shadcn add --overwrite for components already moved to Kit: it creates duplicates. When moving another component, add an explicit Kit export, move dependencies, and replace consumer imports. Kit imports must not depend on @/ aliases or admin files.
