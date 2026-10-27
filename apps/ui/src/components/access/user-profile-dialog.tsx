"use client";
import { useEffect, useState } from "react";
import type { CurrentUser } from "@asmblyr-collaborative/contracts";
import { EditorDialog } from "@/components/collections/editor-dialog";
import { ProfileForm } from "@/components/settings/profile-form";
import { ProfileDates } from "@/components/settings/profile-dates";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";
import { userDisplayName } from "@/lib/user-profile";
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
          setError((cause as Error).message);
        }
      });
    return () => {
      active = false;
    };
  }, [userId]);
  return (
    <EditorDialog
      open
      title={user ? userDisplayName(user) : email}
      eyebrow={copy("Профиль пользователя")}
      onClose={onClose}
    >
      {(container) => (
        <div className="space-y-5 pb-4">
          {error && (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {error}
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
              <ProfileDates user={user} />
            </>
          )}
        </div>
      )}
    </EditorDialog>
  );
}
