"use client";

import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UserAccessDialog } from "./user-access-dialog";
import { UserProfileDialog } from "./user-profile-dialog";
import { userDisplayName } from "@/lib/user-profile";
import { accessRequest } from "@/lib/access-request";
import { type AccessUser, type Policy } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function UsersPanel({
  readOnly = false,
  canManageDelegation = false,
  canManageSystemFields = false,
  delegatablePolicyIds = [],
  currentUserId,
  users,
  policies,
  onChange,
  onError,
}: {
  readOnly?: boolean;
  canManageDelegation?: boolean;
  canManageSystemFields?: boolean;
  delegatablePolicyIds?: string[];
  currentUserId?: string;
  users: AccessUser[];
  policies: Policy[];
  onChange: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const copy = useUiCopy();

  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState<{
    email: string;
    token: string;
    expiresAt: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AccessUser | null>(null);
  const [profileUser, setProfileUser] = useState<AccessUser | null>(null);

  function canRenew(user: AccessUser): boolean {
    if (
      readOnly ||
      user.superuser ||
      user.hasPassword ||
      !user.invitationPending ||
      user.status !== "active"
    ) {
      return false;
    }
    return (
      canManageDelegation ||
      (user.id !== currentUserId &&
        !user.hasDelegation &&
        user.policyIds.every((id) => delegatablePolicyIds.includes(id)))
    );
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (readOnly || busy) {
      return;
    }
    setBusy(true);
    onError("");
    try {
      const result = await accessRequest<{
        data: {
          user: { email: string };
          invitationToken: string;
          expiresAt: string;
        };
      }>("/users", "POST", { email });
      setInvite({
        email: result.data.user.email,
        token: result.data.invitationToken,
        expiresAt: result.data.expiresAt,
      });
      setEmail("");
      await onChange();
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function renew(user: AccessUser) {
    if (readOnly || busy) {
      return;
    }
    setBusy(true);
    onError("");
    try {
      const result = await accessRequest<{
        data: { invitationToken: string; expiresAt: string };
      }>(`/users/${user.id}/invitation`, "POST", {});
      setInvite({
        email: user.email,
        token: result.data.invitationToken,
        expiresAt: result.data.expiresAt,
      });
    } catch (error) {
      onError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const invitationUrl =
    invite && typeof window !== "undefined"
      ? `${window.location.origin}/invite#token=${encodeURIComponent(invite.token)}`
      : "";

  return (
    <section className="space-y-5 rounded-xl border bg-card p-5">
      <div>
        <h2 className="text-xl font-semibold">{copy("Пользователи")}</h2>
        <p className="text-sm text-muted-foreground">
          {readOnly
            ? copy("Участники команды и назначенные им права.")
            : copy(
                "Добавьте почту и передайте пользователю одноразовую ссылку для входа. Отправка письма не нужна.",
              )}
        </p>
      </div>
      {!readOnly && (
        <form
          onSubmit={create}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="min-w-64 flex-1 space-y-2">
            <Label htmlFor="access-email">{copy("Электронная почта")}</Label>
            <Input
              id="access-email"
              type="email"
              required
              value={email}
              disabled={busy}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <Button
            type="submit"
            disabled={busy}
          >
            {copy("Пригласить ")}
          </Button>
        </form>
      )}
      {invite && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="font-medium">
            {copy("Ссылка для ")}
            {invite.email} {copy(" показана один раз. Действует до")}{" "}
            {new Date(invite.expiresAt).toLocaleString(
              copy.locale === "en" ? "en-US" : "ru-RU",
            )}
            .
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              readOnly
              aria-label={copy("Ссылка приглашения")}
              value={invitationUrl}
              className="min-w-64 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(invitationUrl)}
            >
              {copy("Копировать ")}
            </Button>
          </div>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{copy("Почта")}</TableHead>
            <TableHead>{copy("Состояние")}</TableHead>
            <TableHead>{copy("Политики")}</TableHead>
            <TableHead>{copy("Приглашение")}</TableHead>
            <TableHead>{copy("Доступ")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <button
                  type="button"
                  className="text-left font-medium hover:underline"
                  onClick={() => setProfileUser(user)}
                >
                  {userDisplayName(user)}
                </button>
                {userDisplayName(user) !== user.email && (
                  <div className="text-xs text-muted-foreground">
                    {user.email}
                  </div>
                )}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    user.status === "disabled"
                      ? "destructive"
                      : user.superuser
                        ? "default"
                        : user.hasPassword
                          ? "secondary"
                          : "outline"
                  }
                >
                  {user.status === "disabled"
                    ? copy("Отключён")
                    : user.superuser
                      ? copy("Суперпользователь")
                      : user.hasPassword
                        ? copy("Активен")
                        : user.invitationPending
                          ? copy("Приглашён")
                          : copy("Активен")}
                </Badge>
              </TableCell>
              <TableCell className="whitespace-normal">
                {user.policyIds
                  .map(
                    (id) => policies.find((policy) => policy.id === id)?.name,
                  )
                  .filter(Boolean)
                  .join(", ") || "—"}
              </TableCell>
              <TableCell>
                {canRenew(user) && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => renew(user)}
                  >
                    {copy("Новая ссылка ")}
                  </Button>
                )}
                {canManageDelegation &&
                  !readOnly &&
                  !user.superuser &&
                  user.status === "active" &&
                  !user.invitationPending && (
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={async () => {
                        setBusy(true);
                        onError("");
                        try {
                          const result = await accessRequest<{
                            data: {
                              invitationToken: string;
                              expiresAt: string;
                            };
                          }>(`/users/${user.id}/recovery`, "POST", {});
                          setInvite({
                            email: user.email,
                            token: result.data.invitationToken,
                            expiresAt: result.data.expiresAt,
                          });
                        } catch (failure) {
                          onError((failure as Error).message);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {copy("Восстановить вход ")}
                    </Button>
                  )}
              </TableCell>
              <TableCell>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setSelectedUser(user)}
                >
                  {copy("Посмотреть ")}
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {selectedUser && (
        <UserAccessDialog
          key={selectedUser.id}
          userId={selectedUser.id}
          email={selectedUser.email}
          policies={policies}
          canManageDelegation={canManageDelegation}
          onDelegationSaved={onChange}
          onClose={() => setSelectedUser(null)}
        />
      )}
      {profileUser && (
        <UserProfileDialog
          userId={profileUser.id}
          email={profileUser.email}
          readOnly={readOnly}
          canChooseAvatar={canManageDelegation}
          canManageSystemFields={canManageSystemFields}
          onClose={() => setProfileUser(null)}
          onSaved={onChange}
        />
      )}
    </section>
  );
}
