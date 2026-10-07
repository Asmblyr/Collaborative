"use client";

import { useEffect, useState } from "react";
import type { SystemCollection } from "@asmblyr-collaborative/contracts";
import type { Collection } from "@/components/items/types";
import { SystemRecordFields } from "@/components/collections/system-record-fields";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";

export function UserSystemFields({
  userId,
  container,
  onCancel,
}: {
  userId: string;
  container: HTMLElement | null;
  onCancel(): void;
}) {
  const copy = useUiCopy();
  const [data, setData] = useState<{
    collection: SystemCollection;
    catalog: Collection[];
  } | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      const system = await apiRequest<SystemCollection[]>(
        "/api/system-collections",
      );
      const collection = system.find((entry) => entry.name === "users");
      if (!collection?.fields.some((field) => !field.managed)) {
        return;
      }
      const catalog = await apiRequest<Collection[]>("/api/collections");
      if (active) {
        setData({ collection, catalog });
      }
    }
    void load().catch((cause) => {
      if (active) {
        setError((cause as Error).message);
      }
    });
    return () => {
      active = false;
    };
  }, []);
  if (error) {
    return (
      <p
        role="alert"
        className="text-sm text-destructive"
      >
        {error}
      </p>
    );
  }
  if (!data) {
    return null;
  }
  return (
    <section className="space-y-4 border-t pt-5">
      <h3 className="font-medium">
        {copy("Дополнительные поля пользователя")}
      </h3>
      <SystemRecordFields
        key={userId}
        collection={data.collection}
        id={userId}
        catalog={data.catalog}
        container={container}
        onCancel={onCancel}
        embedded
      />
    </section>
  );
}
