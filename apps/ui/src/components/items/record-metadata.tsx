"use client";

import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import type { Collection, Item } from "./types";

export function RecordMetadata({
  collection,
  item,
}: {
  collection: Collection;
  item: Item;
}) {
  const { locale, t } = useTranslations();
  const readable = (name: string) =>
    collection.access.read?.includes("*") ||
    collection.access.read?.includes(name);
  const fields = [
    ...(collection.timestamps.createdAt && readable("created_at")
      ? ["created_at"]
      : []),
    ...(collection.timestamps.updatedAt && readable("updated_at")
      ? ["updated_at"]
      : []),
  ];
  if (!fields.length) {
    return null;
  }
  return (
    <section
      aria-label={t("system.recordMetadata")}
      className="grid gap-4 border-t pt-5 sm:grid-cols-2"
    >
      {fields.map((name) => {
        const value = item[name];
        let displayed = t("system.unknownDate");
        if (value != null) {
          const date = new Date(String(value));
          displayed = String(value);
          if (!Number.isNaN(date.valueOf())) {
            displayed = `${date.toLocaleString(locale === "en" ? "en-US" : "ru-RU", { timeZone: "UTC" })} UTC`;
          }
        }
        return (
          <div
            key={name}
            className="space-y-1"
          >
            <p className="text-xs text-muted-foreground">
              {t(`system.${name}`)}
            </p>
            <p className="text-xs tabular-nums">{displayed}</p>
          </div>
        );
      })}
    </section>
  );
}
