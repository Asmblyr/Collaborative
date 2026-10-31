"use client";

import { useState } from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { apiRequest } from "@/lib/api-request";
import { showToast } from "@/components/ui/toast";
import { ApplicationConnectionCard } from "./application-connection-card";
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
      policyManaged: false,
      scopeLabels: {},
    },
  );
  const [id, setId] = useState(initial?.id);
  const [tab, setTab] = useState("general");
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
    const redirectUris = draft.redirectUris
      .map((uri) => uri.trim())
      .filter(Boolean);
    if (!draft.name.trim() || !redirectUris.length) {
      setTab("general");
      setError(
        !draft.name.trim()
          ? copy("Укажите название приложения")
          : copy("Укажите хотя бы один адрес возврата"),
      );
      return;
    }
    pending(true);
    setError("");
    try {
      const emailDomains = draft.emailDomains
        .map((domain) => domain.trim())
        .filter(Boolean);
      if (
        !draft.policyManaged &&
        draft.accessMode === "domains" &&
        !emailDomains.length
      ) {
        setTab("access");
        throw new Error(
          copy("Добавьте хотя бы один домен почты во вкладке «Доступ»"),
        );
      }
      const scopes = draft.scopes.map((scope) => scope.trim()).filter(Boolean);
      if (new Set(scopes).size !== scopes.length) {
        setTab("service");
        throw new Error(copy("Значения разрешений не должны повторяться"));
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
        policyManaged: draft.policyManaged,
        scopeLabels: Object.fromEntries(
          Object.entries(draft.scopeLabels)
            .filter(
              ([scope, label]) => scopes.includes(scope.trim()) && label.trim(),
            )
            .map(([scope, label]) => [scope.trim(), label.trim()]),
        ),
        redirectUris,
        scopes,
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
      if (result.clientSecret) {
        setSecret(result.clientSecret);
      }
      setSaved(true);
      showToast(copy("Настройки сохранены"), "success");
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
  async function rotate(): Promise<boolean> {
    if (readOnly || busy || !id) {
      return false;
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
      return true;
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : copy("Не удалось заменить секрет"),
      );
      return false;
    } finally {
      pending(false);
    }
  }
  return (
    <form
      noValidate
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
          tab={tab}
          onTabChange={setTab}
        />
        <ApplicationConnectionCard
          id={id}
          issuer={issuer}
          readOnly={readOnly}
          confidential={draft.clientType === "confidential"}
          secret={secret}
          onRotate={rotate}
          onAcknowledgeSecret={() => {
            setSecret("");
            onDirty(!saved);
          }}
        />
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
              {copy("Сохранено")}
            </p>
          )}
        </div>
      </fieldset>
    </form>
  );
}
