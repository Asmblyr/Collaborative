import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  TranslationProvider,
  useTranslations,
  usePluginTranslations,
} from "@asmblyr-collaborative/kit/ui/i18n";
import {
  coreTranslations,
  collectionLabels,
} from "@asmblyr-collaborative/contracts/translations";
import type {
  UiLocale,
  TranslationCatalogs,
} from "@asmblyr-collaborative/contracts";
import { useLocalizedCatalog } from "../src/components/items/use-localized-catalog";
import type { Collection } from "../src/components/items/types";
import { RecordMetadata } from "../src/components/items/record-metadata";

test("SSR translations isolate locales, use namespace fallbacks and escape text", () => {
  const plugin: TranslationCatalogs = {
    ru: { title: "Обсуждение", greeting: "Привет, {{name}}" },
    en: { greeting: "Hello, {{name}}" },
  };
  function Sample() {
    const { t } = useTranslations();
    const { t: p } = usePluginTranslations("comments");
    return createElement(
      "p",
      {},
      `${t("appearance.ocean")} / ${p("title")} / ${p("greeting", undefined, { name: "<script>" })}`,
    );
  }
  const render = (locale: UiLocale) =>
    renderToStaticMarkup(
      createElement(
        TranslationProvider,
        {
          locale,
          catalogs: { core: coreTranslations, "plugin.comments": plugin },
        },
        createElement(Sample),
      ),
    );
  assert.equal(
    render("en"),
    "<p>Ocean / Обсуждение / Hello, &lt;script&gt;</p>",
  );
  assert.equal(
    render("ru"),
    "<p>Океан / Обсуждение / Привет, &lt;script&gt;</p>",
  );
  assert.equal(
    render("en"),
    "<p>Ocean / Обсуждение / Hello, &lt;script&gt;</p>",
  );
  assert.deepEqual(
    Object.keys(coreTranslations.ru).sort(),
    Object.keys(coreTranslations.en).sort(),
  );
});

test("localized schema labels preserve technical IDs, original metadata and user ownership", () => {
  const collection = {
    name: "plugin_comments_entries",
    displayName: "Original",
    translations: { en: { label: "User label" } },
    primaryKey: { name: "record_key" },
    timestamps: { createdAt: true, updatedAt: false },
    fields: [{ name: "body", presentation: undefined }],
  };
  const before = JSON.stringify(collection);
  const labels = collectionLabels(collection, "en", [
    {
      namespace: "comments",
      translations: {
        en: {
          "collection.entries.label": "Comments",
          "field.entries.body.label": "Message",
        },
      },
    },
  ]);
  assert.equal(labels.label, "User label");
  assert.equal(labels.fields.body.label, "Message");
  assert.equal(labels.fields.created_at.label, "Created");
  assert.equal(labels.fields.record_key.label, "ID");
  assert.equal(labels.fields.updated_at, undefined);
  assert.equal(JSON.stringify(collection), before);
});

test("host uses API catalogs for backend-only plugins and does not save translated display copies", () => {
  const collection: Collection = {
    name: "plugin_backend_entries",
    displayName: "Исходная подпись",
    folderId: null,
    mode: "multiple",
    primaryKey: { name: "id", type: "uuid" },
    timestamps: { createdAt: false, updatedAt: false },
    fields: [{ name: "body", type: "text", required: false, nullable: true }],
    access: {
      read: ["*"],
      create: null,
      update: null,
      delete: false,
      structure: false,
    },
  };
  const before = JSON.stringify(collection);
  function Sample() {
    const [localized] = useLocalizedCatalog([collection]);
    return createElement(
      "p",
      {},
      `${localized.displayName} / ${localized.fields[0].presentation?.label}`,
    );
  }
  const html = renderToStaticMarkup(
    createElement(
      TranslationProvider,
      {
        locale: "en",
        catalogs: {
          core: coreTranslations,
          "plugin.backend": {
            en: {
              "collection.entries.label": "Backend records",
              "field.entries.body.label": "Message",
            },
          },
        },
      },
      createElement(Sample),
    ),
  );
  assert.equal(html, "<p>Backend records / Message</p>");
  assert.equal(JSON.stringify(collection), before);
});

test("record metadata translates permitted timestamps and omits unreadable values", () => {
  const collection: Collection = {
    name: "articles",
    folderId: null,
    mode: "multiple",
    primaryKey: { name: "id", type: "uuid" },
    timestamps: { createdAt: true, updatedAt: true },
    fields: [],
    access: {
      read: ["created_at"],
      create: null,
      update: null,
      delete: false,
      structure: false,
    },
  };
  const html = renderToStaticMarkup(
    createElement(
      TranslationProvider,
      { locale: "en", catalogs: { core: coreTranslations } },
      createElement(RecordMetadata, {
        collection,
        item: { created_at: null, updated_at: "hidden-value" },
      }),
    ),
  );
  assert.match(html, /Record details/);
  assert.match(html, /Created/);
  assert.match(html, /Unknown date/);
  assert.doesNotMatch(html, /Updated|hidden-value/);
});
