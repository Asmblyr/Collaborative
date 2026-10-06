"use client";

import { useState } from "react";
import type {
  IntegrationSection,
  IntegrationsSnapshot,
} from "@asmblyr-collaborative/contracts";
import { ChevronRight, Cloud, ShieldCheck, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useUiCopy } from "@/lib/ui-copy";
import { IntegrationEditor } from "./editor";
import { integrationTitles } from "./titles";
const entries = [
  {
    id: "google" as const,
    icon: Cloud,
    description: "Личные аккаунты · Drive и Sheets",
  },
  {
    id: "storage" as const,
    icon: Cloud,
    description: "S3 или Yandex Object Storage",
  },
  {
    id: "assistant" as const,
    icon: Sparkles,
    description: "Модель, адрес API и ключ ассистента",
  },
  {
    id: "encryption" as const,
    icon: ShieldCheck,
    description: "Локальный ключ или Yandex KMS через федерацию",
  },
];

export function IntegrationsWorkspace({
  initial,
}: {
  initial: IntegrationsSnapshot;
}) {
  const copy = useUiCopy();
  const [snapshot, setSnapshot] = useState(initial);
  const [section, setSection] = useState<IntegrationSection | null>(null);
  return (
    <section className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">
          {copy("Подключения")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {copy(
            "Хранилище, ассистент и защита сохранённых ключей. Доступно только суперпользователю.",
          )}
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        {entries.map((entry) => {
          const value = snapshot[entry.id];
          let detail: string;
          let status: string;
          if (entry.id === "encryption") {
            const local = snapshot.encryption.value.provider === "local";
            detail = local ? "AES-256-GCM" : "Yandex KMS";
            const configured = local
              ? snapshot.bootstrap.localKey
              : snapshot.bootstrap.workloadIdentity &&
                Boolean(
                  snapshot.encryption.value.keyId &&
                    snapshot.encryption.value.serviceAccountId,
                );
            status = configured ? "Включено" : "Нужна настройка";
          } else {
            detail =
              entry.id === "storage"
                ? snapshot.storage.value.bucket
                : entry.id === "google"
                  ? snapshot.google.value.clientId
                  : snapshot.assistant.value.model;
            status =
              "enabled" in value.value && value.value.enabled
                ? "Включено"
                : "Выключено";
          }
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => setSection(entry.id)}
              className="flex w-full items-center gap-3 border-b px-4 py-4 text-left transition-colors last:border-0 hover:bg-accent/40 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <entry.icon
                  className="size-4"
                  aria-hidden
                />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">
                  {copy(integrationTitles[entry.id])}
                </span>
                <span className="mt-1 block truncate text-xs text-muted-foreground">
                  {detail || copy(entry.description)}
                </span>
              </span>
              <span className="flex flex-wrap justify-end gap-2">
                <Badge variant="secondary">{copy(status)}</Badge>
                {value.readOnly && <Badge variant="outline">env</Badge>}
              </span>
              <ChevronRight
                className="size-4 shrink-0 text-muted-foreground"
                aria-hidden
              />
            </button>
          );
        })}
      </div>
      <p className="text-xs leading-5 text-muted-foreground">
        {copy(
          "Секреты после сохранения не отображаются. Отключение подключения сохраняет его настройки.",
        )}
      </p>
      {section && (
        <IntegrationEditor
          key={`${section}:${snapshot.revision}`}
          section={section}
          snapshot={snapshot}
          onClose={() => setSection(null)}
          onSave={(value) => {
            setSnapshot(value);
            setSection(null);
          }}
        />
      )}
    </section>
  );
}
