<a id="переводы"></a>

# Translations

The interface language (`ru`, `en`) is saved in personal preferences independently of color mode and style. The admin uses i18next/react-i18next with bundled catalogs, so it needs no external translation service. Server-rendered instances are isolated.

<a id="кто-переводит-подписи"></a>

## Label ownership

- Interface and system fields: JSON catalogs in `packages/contracts/locales/`.
- Plugins: their own `locales/ru.json`, `locales/en.json`, and plugin namespace.
- Custom collections and fields: the Translations section in the right-side settings editor. Collections have translated labels; fields also support descriptions and placeholders.

The original label is the fallback when a custom translation is missing. Plugin catalogs fall back to Russian. Technical API names, record values, enum values, and record label templates are not translated. Switching languages does not overwrite the underlying schema settings.

## HTTP API

Core: `GET /translations?locale=en`. On the admin domain: `GET /api/translations?locale=en`. SDK: `client.translations.get("en")`.

The API defaults to Russian. Unsupported locales and unknown query parameters return 400. The documentation website's English default does not change this contract.

```json
{
  "data": {
    "version": 1,
    "locale": "en",
    "fallbackLocale": "ru",
    "core": { "appearance.ocean": "Ocean" },
    "plugins": { "comments": { "panel.title": "Discussion" } },
    "schema": {
      "articles": {
        "label": "Articles",
        "fields": {
          "title": { "label": "Title", "description": "", "placeholder": "" }
        }
      }
    }
  }
}
```

An active human or service account is required. `schema` uses the same visible collections and fields as `GET /collections`: create, read, and update grants are combined for metadata. This does not authorize reading records.

The system key is included; timestamps appear only when accessible. Responses contain no record data, defaults, settings, or secrets. `plugins` includes static public catalogs from all active plugins, even those without UI. Responses use `Cache-Control: private, no-store`.

<a id="покрытие"></a>

## Coverage

RU/EN catalogs cover built-in forms and messages: collection, field, and record editors; filters; permissions; files; profile and security; integrations; assistant; and plugin settings. Dates and formatted numbers follow the locale without losing decimal precision. Switching language also refreshes server-provided labels.

User values, policy names, and chat messages keep their original text. Custom schema translations are explicit.

Plugin settings use `settings.<name>.label`, `settings.<name>.description`, and `settings.<name>.options.<value>`, falling back to the original label. Add built-in strings to both catalogs; checks enforce key and interpolation-parameter parity.

Catalogs are ordinary JSON with stable keys. External tools can prepare translations for review. Automatic AI calls, a paid translation backend, and automatic translation publication are not implemented.
