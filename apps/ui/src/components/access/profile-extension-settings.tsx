"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { Label } from "@/components/ui/label";
import type { Collection } from "@/components/items/types";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
export function ProfileExtensionSettings() {
  const copy = useUiCopy();
  const [collections, setCollections] = useState<Collection[]>([]);
  const [selected, setSelected] = useState("none");
  const [saved, setSaved] = useState("none");
  const [ready, setReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<Collection[]>("/api/collections"),
      apiRequest<{ collection: string } | null>("/api/users/profile-extension"),
    ])
      .then(([catalog, binding]) => {
        if (active) {
          setCollections(
            catalog.filter(
              (entry) =>
                entry.sourceKind !== "materialized-view" &&
                entry.mode === "multiple" &&
                entry.primaryKey.type === "uuid" &&
                !entry.name.startsWith("asmblyr_") &&
                !entry.name.startsWith("plugin_"),
            ),
          );
          setSelected(binding?.collection ?? "none");
          setSaved(binding?.collection ?? "none");
          setReady(true);
        }
      })
      .catch((cause) => {
        if (active) {
          setError((cause as Error).message);
        }
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <section className="space-y-4 rounded-xl border bg-card p-5">
      <div>
        <h2 className="font-semibold">{copy("Расширение профиля")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {copy(
            "Свои поля и связи — в отдельной коллекции с UUID. ID записи совпадает с ID пользователя.",
          )}
        </p>
      </div>
      <div className="max-w-lg space-y-2">
        <Label htmlFor="profile-extension-collection">
          {copy("Коллекция")}
        </Label>
        <div className="flex gap-2">
          <Select
            value={selected}
            disabled={!ready || pending}
            onValueChange={setSelected}
          >
            <SelectTrigger
              id="profile-extension-collection"
              className="w-full"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">
                {copy("Без дополнительных полей")}
              </SelectItem>
              {collections.map((entry) => (
                <SelectItem
                  key={entry.name}
                  value={entry.name}
                >
                  {entry.displayName || entry.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            disabled={!ready || pending || saved === selected}
            onClick={async () => {
              setPending(true);
              setError("");
              try {
                await apiRequest("/api/users/profile-extension", "PUT", {
                  collection: selected === "none" ? null : selected,
                });
                setSaved(selected);
              } catch (cause) {
                setError((cause as Error).message);
              } finally {
                setPending(false);
              }
            }}
          >
            {copy("Сохранить")}
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {copy(
          "Выберите пустую коллекцию. Настройте поля и связи в коллекциях, а доступ к данным — в политиках. Отключение сохраняет данные.",
        )}
      </p>
      <Button
        asChild
        variant="outline"
        size="sm"
      >
        <Link href="/admin/collections">{copy("Настроить коллекции")}</Link>
      </Button>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </section>
  );
}
