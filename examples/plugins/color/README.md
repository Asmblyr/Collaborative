<a id="цвет"></a>

# Color

<!-- languages -->

[English](README.md) · [Русский](README.ru.md)

<!-- /languages -->

An example editor extension for ordinary text fields.

1. Open a text field's Presentation settings.
2. Select Color · extension in Editor.
3. Configure its palette and whether custom colors are allowed.
4. Save. Record cards show the palette; tables show color and HEX.

Each field stores its own palette of 1–24 #RRGGBB colors. Clearing, required validation, and disabling during save are supported. Existing values outside the palette remain until explicitly replaced. Invalid strings display as text without executing HTML/CSS.

`plugin.ts` is the empty server contract. Ui/index.ts registers color:picker; editor, display, settings, and option parsing live in separate small files. There are no Core/UI imports.

Build: pnpm --filter @asmblyr-collaborative/plugin-color build. It is disabled by default; see [example setup](../README.md). Restart Core/UI after changing packages. Disabling falls back to ordinary text.

Palette settings constrain UI only, not HTTP API. The server applies normal text-field permissions/constraints.

Full contract: [Kit field editors](../../../packages/kit/FIELDS.md).
