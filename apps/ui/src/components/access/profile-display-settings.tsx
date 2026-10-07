"use client";

import { useEffect, useState } from "react";
import {
  ArrowUp,
  ArrowDown,
  Plus,
  SlidersHorizontal,
  Trash2,
} from "lucide-react";
import type {
  ProfileDisplayConfiguration,
  ProfileDisplayEntry,
} from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { Label } from "@/components/ui/label";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { ProfileDisplaySourcePicker } from "./profile-display-source";

export function ProfileDisplaySettings() {
  const copy = useUiCopy();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(true)}
      >
        <SlidersHorizontal className="size-4" />
        {copy("Вид профиля")}
      </Button>
      {open && <ProfileDisplayEditor onClose={() => setOpen(false)} />}
    </>
  );
}

function ProfileDisplayEditor({ onClose }: { onClose(): void }) {
  const copy = useUiCopy();
  const [config, setConfig] = useState<ProfileDisplayConfiguration | null>(
    null,
  );
  const [saved, setSaved] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    apiRequest<ProfileDisplayConfiguration>("/api/users/profile-display")
      .then((result) => {
        if (active) {
          setConfig(result);
          setSaved(JSON.stringify(result));
        }
      })
      .catch(() => {
        if (active) {
          setError(copy("Не удалось загрузить настройки профиля"));
        }
      });
    return () => {
      active = false;
    };
  }, [copy]);
  const dirty = Boolean(config && JSON.stringify(config) !== saved);
  function update(id: string, change: Partial<ProfileDisplayEntry>) {
    setMessage("");
    setConfig(
      (current) =>
        current && {
          ...current,
          entries: current.entries.map((entry) =>
            entry.id === id ? { ...entry, ...change } : entry,
          ),
        },
    );
  }
  function move(index: number, delta: number) {
    if (!config) {
      return;
    }
    const entries = [...config.entries];
    [entries[index], entries[index + delta]] = [
      entries[index + delta],
      entries[index],
    ];
    setConfig({ ...config, entries });
    setMessage("");
  }
  async function save() {
    setPending(true);
    setError("");
    setMessage("");
    try {
      const next = await apiRequest<ProfileDisplayConfiguration>(
        "/api/users/profile-display",
        "PUT",
        config,
      );
      setConfig(next);
      setSaved(JSON.stringify(next));
      setMessage(copy("Вид профиля сохранён"));
      window.dispatchEvent(new Event("profile-display-updated"));
    } catch {
      setError(
        copy(
          "Не удалось сохранить. Проверьте подписи и выберите конечное поле в каждой строке.",
        ),
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <EditorDialog
      open
      title={copy("Вид профиля")}
      eyebrow={copy("Пользователи")}
      onClose={onClose}
      hasUnsavedChanges={dirty}
      busy={pending}
      footer={
        <div className="flex justify-end gap-2">
          <Button
            size="sm"
            disabled={
              !dirty ||
              pending ||
              config?.entries.some(
                (entry) => !entry.label.trim() || !entry.path.length,
              )
            }
            onClick={() => void save()}
          >
            {pending ? copy("Сохраняем…") : copy("Сохранить")}
          </Button>
        </div>
      }
    >
      {(container) => (
        <div className="space-y-6 pb-4">
          <p className="text-sm text-muted-foreground">
            {copy(
              "Выберите информацию для карточки пользователя. Значения берутся из полей и связей и обновляются вместе с исходными данными.",
            )}
          </p>
          {config && (
            <>
              <div className="space-y-2">
                <Label htmlFor="profile-display-title">
                  {copy("Заголовок блока")}
                </Label>
                <Input
                  id="profile-display-title"
                  maxLength={100}
                  placeholder={copy("Дополнительная информация")}
                  disabled={pending}
                  value={config.title}
                  onChange={(event) => {
                    setConfig({ ...config, title: event.target.value });
                    setMessage("");
                  }}
                />
              </div>
              <div className="space-y-3">
                {config.entries.map((entry, index) => (
                  <div
                    key={entry.id}
                    className="min-w-0 space-y-3 rounded-xl border p-4"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor={`profile-label-${entry.id}`}>
                        {copy("Подпись")}
                      </Label>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending || index === 0}
                          aria-label={copy("Выше")}
                          onClick={() => move(index, -1)}
                        >
                          <ArrowUp className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={
                            pending || index === config.entries.length - 1
                          }
                          aria-label={copy("Ниже")}
                          onClick={() => move(index, 1)}
                        >
                          <ArrowDown className="size-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          disabled={pending}
                          aria-label={copy("Удалить строку")}
                          onClick={() => {
                            setConfig({
                              ...config,
                              entries: config.entries.filter(
                                (item) => item.id !== entry.id,
                              ),
                            });
                            setMessage("");
                          }}
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </div>
                    <Input
                      id={`profile-label-${entry.id}`}
                      value={entry.label}
                      maxLength={100}
                      disabled={pending}
                      onChange={(event) =>
                        update(entry.id, { label: event.target.value })
                      }
                    />
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        {copy("Источник значения")}
                      </p>
                      <ProfileDisplaySourcePicker
                        path={entry.path}
                        disabled={pending}
                        container={container}
                        onChange={(path, label) =>
                          update(entry.id, {
                            path,
                            ...(!entry.label && label ? { label } : {}),
                          })
                        }
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      <Checkbox
                        id={`profile-self-${entry.id}`}
                        checked={entry.selfVisible}
                        disabled={pending}
                        onCheckedChange={(checked) =>
                          update(entry.id, { selfVisible: checked === true })
                        }
                      />
                      <Label
                        className="text-xs font-normal"
                        htmlFor={`profile-self-${entry.id}`}
                      >
                        {copy("Показывать владельцу профиля")}
                      </Label>
                    </div>
                  </div>
                ))}
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={pending || config.entries.length >= 12}
                onClick={() =>
                  setConfig({
                    ...config,
                    entries: [
                      ...config.entries,
                      {
                        id: crypto.randomUUID(),
                        label: "",
                        path: [],
                        selfVisible: false,
                      },
                    ],
                  })
                }
              >
                <Plus className="size-4" />
                {copy("Добавить строку")}
              </Button>
              <p className="text-xs leading-relaxed text-muted-foreground">
                {copy(
                  "Настроенные строки видны управляющим пользователями. Галочка дополнительно разрешает владельцу видеть выбранное значение без доступа ко всему справочнику. Изменять эти данные в профиле нельзя.",
                )}
              </p>
            </>
          )}
          {!config && !error && (
            <p
              role="status"
              className="text-sm text-muted-foreground"
            >
              {copy("Загрузка…")}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
            </p>
          )}
          {message && (
            <p
              role="status"
              className="text-sm text-muted-foreground"
            >
              {message}
            </p>
          )}
        </div>
      )}
    </EditorDialog>
  );
}
