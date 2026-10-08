<!-- Generated from packages/kit/FIELDS.md; edit the source. -->

<a id="редакторы-полеи-из-плагинов"></a>

# Plugin field editors

The initial contract supports ordinary text storage fields. A plugin supplies an editor, optional value display, and per-field settings through its existing ./ui browser export.

```ts
export default defineUiPlugin({
  fieldInterfaces: [
    {
      id: "picker",
      title: "Color",
      types: ["text"],
      editor: ColorEditor,
      display: ColorDisplay,
      settings: ColorSettings,
    },
  ],
});
```

See the working [color example](plugin-color.md). Server plugin.ts remains definePlugin({}); no tables or endpoints are needed. Enablement, build, source/built discovery, and shared components follow page/panel conventions.

<a id="контракт-компонентов"></a>

## Component contract

Types from @asmblyr-collaborative/kit/ui:

- FieldEditorProps: id, label, value, options, disabled, required, placeholder, describedBy, onChange(value).
- FieldDisplayProps: value:string|null, options.
- FieldInterfaceSettingsProps: options, disabled, onChange(options).

Options is a JSON object. Handle empty, older, and unknown options with suitable defaults. Settings changes use the callback and belong to that field.

Editors receive string drafts; empty string means no input. Core's form owns null conversion, omission for create defaults, required validation, and API submission. Do not save records from editors or replace callbacks with separate storage. Call onChange only after user action, respect disabled, and never mutate values on mount. Host/API enforce field reads/writes.

Use native required, pattern, and setCustomValidity on Input/Textarea. The form checks changed fields before save and shows errors at the field. Server validation remains essential; UI constraints are not API authorization.

Import shadcn components from @asmblyr-collaborative/kit/ui/&lt;component&gt;. PortalContainerContext keeps nested Select portals inside the native dialog. Components must support React SSR: access DOM in handlers/effects, not imports or render.

<a id="хранение-и-отключение"></a>

## Persistence and disabling

Existing presentation JSONB stores:

```json
{
  "interface": "auto",
  "extension": {
    "id": "color:picker",
    "options": { "palette": ["#0d9488", "#3b82f6"], "allowCustom": false }
  }
}
```

IDs use namespace:local-id. Core validates format, compatible type, and bounded JSON: 8 KiB, depth 8, 1000 nodes. Metadata URLs/imports are never executed. Field readers see options, so they must contain no secrets. No new database migration is required.

Missing packages retain settings. UI loads only built extensions enabled in Core. If absent, editors fall back to the standard input with a notice, and displays to plain text. Client render errors also trigger fallback. The host retains the draft. Re-enabling restores presentation.

Changing editor explicitly removes the prior extension/options without changing stored values. Plugin presentation takes precedence over built-in display; selecting it clears the old display.

<a id="границы-этапа"></a>

## Limits

- An editor may include its own display; independent plugin-display selection is unsupported.
- Extensions define no SQL type, server validator, or separate permissions.
- Color supports HEX #RRGGBB. AllowCustom controls UI choices; API values remain strings under ordinary Core rules.
- Events, external catalogs, relationship editors, and asynchronous editor operations are not part of this contract.
