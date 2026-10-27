"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  CurrentUser,
  UserFormResult,
} from "@asmblyr-collaborative/contracts";
import { ItemForm } from "@/components/items/item-form";
import type { Collection } from "@/components/items/types";
import { useLocalizedCatalog } from "@/components/items/use-localized-catalog";
import { useEditorState } from "@/components/collections/editor-lifecycle";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { ProfileAvatar } from "./profile-avatar";
import { ProfileExtensionFields } from "./profile-extension-fields";

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
  const formEndpoint =
    endpoint === "/api/users/me"
      ? `${endpoint}/form`
      : endpoint.replace(/\/profile$/, "/form");
  const [form, setForm] = useState<UserFormResult | null>(null);
  const [catalog, setCatalog] = useState<Collection[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [avatarId, setAvatarId] = useState(user.avatarId);
  const [pending, setPending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dirty, setDirty] = useState(0);
  const [revision, setRevision] = useState(0);
  const localized = useLocalizedCatalog(catalog);
  const avatarDirty = avatarId !== (form ? form.user.avatarId : user.avatarId);
  const canEdit = Boolean(
    form &&
      !readOnly &&
      (form.canEditAvatar ||
        form.fields.some((field) => !form.readOnlyFields.includes(field.name))),
  );
  const canEditFields = Boolean(
    form &&
      !readOnly &&
      form.fields.some((field) => !form.readOnlyFields.includes(field.name)),
  );
  useEditorState(dirty > 0 || avatarDirty, pending || uploading);
  useEffect(() => {
    let active = true;
    Promise.all([
      apiRequest<UserFormResult>(formEndpoint),
      apiRequest<Collection[]>("/api/collections"),
    ])
      .then(([next, collections]) => {
        if (active) {
          setForm(next);
          setAvatarId(next.user.avatarId);
          setCatalog(collections);
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
  }, [formEndpoint]);
  return (
    <div className="space-y-5">
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {!form && !error && <p role="status">{copy("Загружаем профиль…")}</p>}
      {form && (
        <>
          <ProfileAvatar
            avatarId={avatarId}
            pictureUrl={form.user.pictureUrl}
            canUpload={Boolean(form.canEditAvatar && !readOnly)}
            canChoose={canChooseAvatar && form.canEditAvatar && !readOnly}
            disabled={pending || uploading || readOnly || !form.canEditAvatar}
            container={container}
            onBusy={setUploading}
            onChange={setAvatarId}
          />
          <ItemForm
            key={revision}
            fields={form.fields.map((field) => ({
              ...field,
              presentation: {
                description: "",
                placeholder: "",
                interface: "auto",
                width: "full",
                order: 0,
                group: "",
                ...field.presentation,
                label:
                  field.managed && !field.name.startsWith("@display:")
                    ? copy(field.presentation?.label || field.name)
                    : field.presentation?.label || field.name,
              },
            }))}
            catalog={localized}
            item={{ id: user.id, ...form.values }}
            primaryKey={{ name: "id", type: "uuid" }}
            formLayout={form.layout}
            plainGroups
            readOnlyFields={
              readOnly
                ? form.fields.map((field) => field.name)
                : form.readOnlyFields
            }
            pending={pending || uploading}
            embedded
            hideActions={!canEdit || (!canEditFields && !avatarDirty)}
            preview={readOnly}
            allowUnchanged={avatarDirty}
            portalContainer={container}
            onDirtyChange={setDirty}
            onBusyChange={setUploading}
            onCancel={() => {
              setAvatarId(form.user.avatarId);
              setRevision((value) => value + 1);
              setDirty(0);
            }}
            onSave={async (values) => {
              setPending(true);
              setMessage("");
              try {
                const result = await apiRequest<UserFormResult>(
                  formEndpoint,
                  "PATCH",
                  { values, ...(avatarDirty ? { avatarId } : {}) },
                );
                setForm(result);
                setAvatarId(result.user.avatarId);
                setDirty(0);
                setRevision((value) => value + 1);
                setMessage(copy("Профиль сохранён"));
                onSaved?.(result.user);
                router.refresh();
              } finally {
                setPending(false);
              }
            }}
          />
          {!canEditFields && (
            <p className="text-xs text-muted-foreground">
              {copy("Для изменения этих полей обратитесь к администратору.")}
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
          <ProfileExtensionFields
            userId={user.id}
            endpoint={formEndpoint.replace(/\/form$/, "/extension")}
            readOnly={readOnly}
            container={container}
          />
        </>
      )}
    </div>
  );
}
