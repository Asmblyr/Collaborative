"use client";

import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@asmblyr/kit/ui/button";
import { Input } from "@asmblyr/kit/ui/input";
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
import { accessRequest } from "@/lib/access-request";
import { type AccessUser, type Policy } from "./types";

export function UsersPanel({
  readOnly = false,
  canManageDelegation = false,
  delegatablePolicyIds = [],
  currentUserId,
  users,
  policies,
  onChange,
  onError,
}: {
  readOnly?: boolean;
  canManageDelegation?: boolean;
  delegatablePolicyIds?: string[];
  currentUserId?: string;
  users: AccessUser[];
  policies: Policy[];
  onChange: () => Promise<void>;
  onError: (message: string) => void;
}) {
  const [email, setEmail] = useState("");
  const [invite, setInvite] = useState<{
    email: string;
    token: string;
    expiresAt: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AccessUser | null>(null);

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
        <h2 className="text-xl font-semibold">Пользователи</h2>
        <p className="text-sm text-muted-foreground">
          {readOnly
            ? "Участники команды и назначенные им права."
            : "Добавьте почту и передайте пользователю одноразовую ссылку для входа. Отправка письма не нужна."}
        </p>
      </div>
      {!readOnly && (
        <form
          onSubmit={create}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="min-w-64 flex-1 space-y-2">
            <Label htmlFor="access-email">Электронная почта</Label>
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
            Пригласить
          </Button>
        </form>
      )}
      {invite && (
        <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
          <p className="font-medium">
            Ссылка для {invite.email} показана один раз. Действует до{" "}
            {new Date(invite.expiresAt).toLocaleString("ru-RU")}.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              readOnly
              aria-label="Ссылка приглашения"
              value={invitationUrl}
              className="min-w-64 flex-1"
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => navigator.clipboard.writeText(invitationUrl)}
            >
              Копировать
            </Button>
          </div>
        </div>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Почта</TableHead>
            <TableHead>Состояние</TableHead>
            <TableHead>Политики</TableHead>
            <TableHead>Приглашение</TableHead>
            <TableHead>Доступ</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell className="font-medium">{user.email}</TableCell>
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
                    ? "Отключён"
                    : user.superuser
                      ? "Суперпользователь"
                      : user.hasPassword
                        ? "Активен"
                        : user.invitationPending
                          ? "Приглашён"
                          : "Активен"}
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
                    Новая ссылка
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
                      Восстановить вход
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
                  Посмотреть
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
    </section>
  );
}
