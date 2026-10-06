"use client";

import { useState } from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import { apiRequest } from "@/lib/api-request";
import { ApplicationFields } from "./application-fields";
import type { ApplicationDraft, OAuthApplication, OAuthUser } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function ApplicationEditor({
  readOnly = false,
  initial,
  users,
  issuer,
  portal,
  onSaved,
  onBusy,
  onDirty,
}: {
  readOnly?: boolean;
  initial: OAuthApplication | null;
  users: OAuthUser[];
  issuer: string;
  portal: HTMLDialogElement | null;
  onSaved: () => void;
  onBusy: (busy: boolean) => void;
  onDirty: (dirty: boolean) => void;
}) {
  const copy = useUiCopy();

  const [draft, setDraft] = useState<ApplicationDraft>(
    initial ?? {
      name: "",
      description: "",
      enabled: true,
      clientType: "confidential",
      redirectUris: [""],
      userIds: [],
      accessMode: "all",
      emailDomains: [],
      audience: "",
      scopes: [],
    },
  );
  const [id, setId] = useState(initial?.id);
  const [secret, setSecret] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  function pending(value: boolean) {
    setBusy(value);
    onBusy(value);
  }
  function update(value: ApplicationDraft) {
    setDraft(value);
    setSaved(false);
    onDirty(true);
  }
  async function save() {
    if (readOnly || busy) {
      return;
    }
    pending(true);
    setError("");
    try {
      const emailDomains = draft.emailDomains
        .map((domain) => domain.trim())
        .filter(Boolean);
      if (draft.accessMode === "domains" && !emailDomains.length) {
        throw new Error(
          copy("Добавьте хотя бы один домен почты во вкладке «Доступ»"),
        );
      }
      const payload = {
        name: draft.name,
        description: draft.description,
        enabled: draft.enabled,
        clientType: draft.clientType,
        userIds: draft.accessMode === "all" ? [] : draft.userIds,
        accessMode: draft.accessMode,
        emailDomains: draft.accessMode === "domains" ? emailDomains : [],
        audience: draft.audience,
        redirectUris: draft.redirectUris
          .map((uri) => uri.trim())
          .filter(Boolean),
        scopes: draft.scopes.map((scope) => scope.trim()).filter(Boolean),
      };
      const result = await apiRequest<{
        application: OAuthApplication;
        clientSecret?: string;
      }>(
        id ? `/api/oauth-apps/${id}` : "/api/oauth-apps",
        id ? "PUT" : "POST",
        payload,
      );
      setId(result.application.id);
      setDraft(result.application);
      if (result.clientSecret) setSecret(result.clientSecret);
      setSaved(true);
      onDirty(Boolean(result.clientSecret || secret));
      onSaved();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : copy("Не удалось сохранить приложение"),
      );
    } finally {
      pending(false);
    }
  }
  async function rotate() {
    if (readOnly || busy || !id) {
      return;
    }
    pending(true);
    setError("");
    try {
      const result = await apiRequest<{ clientSecret: string }>(
        `/api/oauth-apps/${id}/secret`,
        "POST",
        {},
      );
      setSecret(result.clientSecret);
      onDirty(true);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : copy("Не удалось заменить секрет"),
      );
    } finally {
      pending(false);
    }
  }
  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <fieldset
        disabled={busy}
        className="space-y-6"
      >
        <ApplicationFields
          readOnly={readOnly}
          draft={draft}
          onChange={update}
          users={users}
          existing={Boolean(id)}
          portal={portal}
        />
        {id && (
          <section className="space-y-4 rounded-xl border p-4">
            <h3 className="text-sm font-medium">{copy("Подключение")}</h3>
            <div className="space-y-2">
              <Label htmlFor="oauth-client-id">Client ID</Label>
              <Input
                id="oauth-client-id"
                readOnly
                value={id}
                className="font-mono text-xs"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="oauth-issuer">Issuer</Label>
              <Input
                id="oauth-issuer"
                readOnly
                value={issuer}
                className="text-xs"
              />
            </div>
            <p className="break-all text-xs text-muted-foreground">
              Discovery: {issuer}/.well-known/openid-configuration
            </p>
            <p className="text-xs text-muted-foreground">
              {copy("Scopes профиля: openid profile email ")}
            </p>
            {!readOnly && draft.clientType === "confidential" && (
              <Button
                type="button"
                variant="outline"
                onClick={rotate}
              >
                {copy("Заменить секрет (старый перестанет работать) ")}
              </Button>
            )}
          </section>
        )}
        {secret && (
          <section className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
            <Label htmlFor="oauth-secret">
              {copy("Секрет · показывается один раз")}
            </Label>
            <Input
              id="oauth-secret"
              value={secret}
              readOnly
              autoComplete="off"
              className="font-mono text-xs"
            />
            <p className="text-xs text-muted-foreground">
              {copy(
                "Сохраните его в настройках сервиса. После закрытия прочитать секрет снова нельзя. ",
              )}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSecret("");
                onDirty(!saved);
              }}
            >
              {copy("Я сохранил секрет ")}
            </Button>
          </section>
        )}
        {error && (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {copy(error)}
          </p>
        )}
        <div className="flex items-center gap-3">
          {!readOnly && (
            <Button type="submit">
              {busy
                ? copy("Сохраняем…")
                : id
                  ? copy("Сохранить")
                  : copy("Создать приложение")}
            </Button>
          )}
          {saved && (
            <p
              role="status"
              className="text-sm text-muted-foreground"
            >
              {copy("Сохранено ")}
            </p>
          )}
        </div>
      </fieldset>
    </form>
  );
}
