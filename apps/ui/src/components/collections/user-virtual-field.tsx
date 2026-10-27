"use client";

import { useEffect, useState } from "react";
import type {
  ProfileDisplayConfiguration,
  ProfileDisplayEntry,
} from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ProfileDisplaySourcePicker } from "@/components/access/profile-display-source";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { useEditorState } from "./editor-lifecycle";

export function UserVirtualField({
  fieldId,
  container,
  onSaved,
}: {
  fieldId?: string;
  container: HTMLElement | null;
  onSaved: () => void;
}) {
  const copy = useUiCopy();
  const [config, setConfig] = useState<ProfileDisplayConfiguration | null>(
    null,
  );
  const [entry, setEntry] = useState<ProfileDisplayEntry | null>(null);
  const [saved, setSaved] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  useEditorState(Boolean(entry && JSON.stringify(entry) !== saved), pending);
  useEffect(() => {
    let active = true;
    apiRequest<ProfileDisplayConfiguration>("/api/users/profile-display")
      .then((next) => {
        if (!active) {
          return;
        }
        const initial = next.entries.find((item) => item.id === fieldId) ?? {
          id: crypto.randomUUID(),
          label: "",
          path: [],
          selfVisible: false,
        };
        setConfig(next);
        setEntry(initial);
        setSaved(JSON.stringify(initial));
      })
      .catch((cause) => {
        if (active) {
          setError((cause as Error).message);
        }
      });
    return () => {
      active = false;
    };
  }, [fieldId]);
  async function save(remove = false) {
    if (!config || !entry) {
      return;
    }
    setPending(true);
    setError("");
    try {
      const others = config.entries.filter((item) => item.id !== entry.id);
      // Preserve existing ordering and all unrelated projections.
      const entries = remove
        ? others
        : fieldId
          ? config.entries.map((item) => (item.id === entry.id ? entry : item))
          : [...others, entry];
      await apiRequest("/api/users/profile-display", "PUT", {
        ...config,
        entries,
      });
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPending(false);
    }
  }
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {copy(
          "Показывает значение существующего поля или связи. Данные не копируются; поле доступно только для просмотра.",
        )}
      </p>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {!entry && !error && <p role="status">{copy("Загрузка…")}</p>}
      {entry && (
        <>
          <div className="space-y-2">
            <Label htmlFor="virtual-field-label">{copy("Название поля")}</Label>
            <Input
              id="virtual-field-label"
              value={entry.label}
              maxLength={100}
              disabled={pending}
              onChange={(event) =>
                setEntry({ ...entry, label: event.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">{copy("Источник значения")}</p>
            <ProfileDisplaySourcePicker
              path={entry.path}
              disabled={pending}
              container={container}
              onChange={(path, label) =>
                setEntry({ ...entry, path, label: entry.label || label || "" })
              }
            />
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="virtual-self-visible"
              checked={entry.selfVisible}
              disabled={pending}
              onCheckedChange={(value) =>
                setEntry({ ...entry, selfVisible: value === true })
              }
            />
            <Label htmlFor="virtual-self-visible">
              {copy("Показывать владельцу профиля")}
            </Label>
          </div>
          <p className="text-xs text-muted-foreground">
            {copy(
              "Показывает владельцу только выбранное значение. Доступ ко всему справочнику не выдаётся.",
            )}
          </p>
          <div className="flex flex-wrap gap-2 border-t pt-4">
            <Button
              disabled={pending || !entry.label.trim() || !entry.path.length}
              onClick={() => void save()}
            >
              {copy("Сохранить")}
            </Button>
            {fieldId && (
              <Button
                variant="outline"
                disabled={pending}
                onClick={() => void save(true)}
              >
                {copy("Удалить виртуальное поле")}
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
