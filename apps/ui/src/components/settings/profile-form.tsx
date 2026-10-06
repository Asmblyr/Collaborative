"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import type { CurrentUser } from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Textarea } from "@asmblyr-collaborative/kit/ui/textarea";
import { Label } from "@/components/ui/label";
import { useEditorState } from "@/components/collections/editor-lifecycle";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { ProfileAvatar } from "./profile-avatar";

function draft(user: CurrentUser) {
  return {
    firstName: user.firstName ?? "",
    lastName: user.lastName ?? "",
    displayName: user.displayName ?? "",
    description: user.description ?? "",
    avatarId: user.avatarId,
  };
}

export function ProfileForm({
  user,
  endpoint = "/api/users/me",
  readOnly = false,
  canChooseAvatar = false,
  onSaved,
  container,
}: {
  user: CurrentUser;
  endpoint?: string;
  readOnly?: boolean;
  canChooseAvatar?: boolean;
  onSaved?: (user: CurrentUser) => void;
  container?: HTMLElement | null;
}) {
  const copy = useUiCopy();
  const router = useRouter();
  const id = useId();
  const [values, setValues] = useState(() => draft(user));
  const [saved, setSaved] = useState(() => JSON.stringify(draft(user)));
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const busy = pending || uploading;
  const dirty = JSON.stringify(values) !== saved;
  useEditorState(dirty, busy);
  const disabled = readOnly || busy;
  function input(
    field: "firstName" | "lastName" | "displayName",
    label: string,
    autoComplete?: string,
  ) {
    return (
      <div className="space-y-2">
        <Label htmlFor={`${id}-${field}`}>{copy(label)}</Label>
        <Input
          id={`${id}-${field}`}
          autoComplete={autoComplete}
          maxLength={120}
          type="text"
          disabled={disabled}
          value={values[field]}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              [field]: event.target.value,
            }))
          }
        />
      </div>
    );
  }
  return (
    <form
      className="space-y-5"
      onSubmit={async (event) => {
        event.preventDefault();
        if (disabled || !dirty) {
          return;
        }
        setPending(true);
        setMessage("");
        setError("");
        try {
          const result = await apiRequest<CurrentUser>(
            endpoint,
            "PATCH",
            values,
          );
          const next = draft(result);
          setValues(next);
          setSaved(JSON.stringify(next));
          setMessage(copy("Профиль сохранён"));
          onSaved?.(result);
          router.refresh();
        } catch (cause) {
          setError(
            cause instanceof Error
              ? cause.message
              : copy("Не удалось сохранить профиль"),
          );
        } finally {
          setPending(false);
        }
      }}
    >
      <ProfileAvatar
        avatarId={values.avatarId}
        pictureUrl={user.pictureUrl}
        canUpload={!readOnly}
        canChoose={canChooseAvatar && !readOnly}
        disabled={disabled}
        container={container}
        onBusy={setUploading}
        onChange={(avatarId) =>
          setValues((current) => ({ ...current, avatarId }))
        }
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {input("firstName", "Имя", "given-name")}
        {input("lastName", "Фамилия", "family-name")}
      </div>
      {input("displayName", "Отображаемое имя", "nickname")}
      <p className="-mt-3 text-xs text-muted-foreground">
        {copy("Если не задано, показываем имя и фамилию, затем почту.")}
      </p>
      <div className="space-y-2">
        <Label htmlFor={`${id}-email`}>{copy("Электронная почта")}</Label>
        <Input
          id={`${id}-email`}
          value={user.email}
          readOnly
          autoComplete="email"
          className="bg-muted/40"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${id}-description`}>{copy("О себе")}</Label>
        <Textarea
          id={`${id}-description`}
          maxLength={2000}
          rows={3}
          disabled={disabled}
          value={values.description}
          onChange={(event) =>
            setValues((current) => ({
              ...current,
              description: event.target.value,
            }))
          }
        />
      </div>
      {!readOnly && (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            size="sm"
            disabled={busy || !dirty}
          >
            {pending ? copy("Сохраняем…") : copy("Сохранить изменения")}
          </Button>
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
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </form>
  );
}
