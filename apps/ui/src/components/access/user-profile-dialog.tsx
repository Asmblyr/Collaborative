"use client";

import { useEffect, useRef, useState } from "react";
import type { CurrentUser } from "@asmblyr-collaborative/contracts";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { EditorDialog } from "@/components/ui/editor-dialog";
import { ProfileDates } from "@/components/settings/profile-dates";
import { ProfileForm } from "@/components/settings/profile-form";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { userDisplayName } from "@/lib/user-profile";
import { localizeAccessError } from "./access-helpers";

export function UserProfileDialog({
  userId,
  email,
  readOnly,
  canChooseAvatar,
  onClose,
  onSaved,
}: {
  userId: string;
  email: string;
  readOnly: boolean;
  canChooseAvatar: boolean;
  canManageSystemFields?: boolean;
  onClose(): void;
  onSaved(): Promise<void>;
}) {
  const copy = useUiCopy();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [error, setError] = useState("");
  const [submitState, setSubmitState] = useState<{
    available: boolean;
    disabled: boolean;
    label: string;
  }>({ available: false, disabled: true, label: "" });
  const formHostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    apiRequest<CurrentUser>(`/api/users/${userId}/profile`)
      .then((result) => {
        if (active) {
          setUser(result);
        }
      })
      .catch((cause) => {
        if (active) {
          setError(localizeAccessError((cause as Error).message));
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    const host = formHostRef.current;
    if (!host || readOnly) {
      return;
    }

    function syncSubmitButton() {
      const button = host?.querySelector<HTMLButtonElement>(
        ":scope > div > form button[type='submit']",
      );
      if (!button) {
        setSubmitState({ available: false, disabled: true, label: "" });
        return;
      }
      setSubmitState({
        available: true,
        disabled: button.disabled,
        label: button.textContent?.trim() || "",
      });
    }

    syncSubmitButton();
    const observer = new MutationObserver(syncSubmitButton);
    observer.observe(host, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["disabled"],
      characterData: true,
    });
    return () => observer.disconnect();
  }, [user, readOnly]);

  function triggerProfileSubmit() {
    const form = formHostRef.current?.querySelector<HTMLFormElement>(
      ":scope > div > form",
    );
    form?.requestSubmit();
  }

  return (
    <EditorDialog
      open
      title={user ? userDisplayName(user) : email}
      eyebrow={copy("Профиль пользователя")}
      onClose={onClose}
      footer={(requestClose) => (
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={requestClose}
          >
            {readOnly ? copy("Закрыть") : copy("Отмена")}
          </Button>
          {!readOnly && user && submitState.available && (
            <Button
              type="button"
              disabled={submitState.disabled}
              onClick={triggerProfileSubmit}
            >
              {submitState.label || copy("Сохранить")}
            </Button>
          )}
        </div>
      )}
    >
      {(container) => (
        <div className="space-y-5 pb-4">
          {error && (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {copy(error)}
            </p>
          )}
          {!user && !error && (
            <p
              role="status"
              className="text-sm text-muted-foreground"
            >
              {copy("Загружаем профиль…")}
            </p>
          )}
          {user && (
            <>
              <div
                ref={formHostRef}
                className="[&>div>form>div:has(button[type=submit])]:hidden"
              >
                <ProfileForm
                  user={user}
                  endpoint={`/api/users/${userId}/profile`}
                  readOnly={readOnly}
                  canChooseAvatar={canChooseAvatar}
                  container={container}
                  onSaved={(next) => {
                    setUser(next);
                    void onSaved();
                  }}
                />
              </div>
              <ProfileDates user={user} />
            </>
          )}
        </div>
      )}
    </EditorDialog>
  );
}
