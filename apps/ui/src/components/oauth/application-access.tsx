"use client";

import { useState } from "react";
import { Checkbox } from "@asmblyr/kit/ui/checkbox";
import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@asmblyr/kit/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import type { ApplicationDraft, OAuthUser } from "./types";

export function ApplicationAccess({
  draft,
  onChange,
  users,
  portal,
}: {
  draft: ApplicationDraft;
  onChange: (next: ApplicationDraft) => void;
  users: OAuthUser[];
  portal: HTMLDialogElement | null;
}) {
  const [search, setSearch] = useState("");
  const visibleUsers = users.filter((user) =>
    user.email.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const byDomain = draft.accessMode === "domains";

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="oauth-access-mode">Кто может войти</Label>
        <Select
          value={draft.accessMode}
          onValueChange={(value) =>
            onChange({
              ...draft,
              accessMode: value as ApplicationDraft["accessMode"],
            })
          }
        >
          <SelectTrigger
            id="oauth-access-mode"
            className="w-full"
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent container={portal}>
            <SelectItem value="all">Все активные пользователи</SelectItem>
            <SelectItem value="selected">Выбранные пользователи</SelectItem>
            <SelectItem value="domains">По домену почты</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {draft.accessMode === "all"
            ? "Любой активный пользователь Asmblyr, включая тех, кто появится позже. Каждый подтверждает передачу профиля при входе."
            : "Войти смогут только активные пользователи, которым разрешён доступ ниже."}
        </p>
      </div>
      {byDomain && (
        <div className="space-y-2">
          <Label htmlFor="oauth-email-domains">Разрешённые домены почты</Label>
          <Textarea
            id="oauth-email-domains"
            rows={3}
            value={draft.emailDomains.join("\n")}
            onChange={(event) =>
              onChange({
                ...draft,
                emailDomains: event.target.value.split("\n"),
              })
            }
            placeholder={"company.ru\npartner.com"}
            aria-describedby="oauth-domains-help"
          />
          <p
            id="oauth-domains-help"
            className="text-xs leading-relaxed text-muted-foreground"
          >
            По одному домену на строку. Можно указать @company.ru. Поддомены
            добавляйте отдельно: team.company.ru. Используется почта профиля
            Asmblyr; правило не подтверждает владение адресом.
          </p>
        </div>
      )}
      {draft.accessMode !== "all" && (
        <div className="space-y-3">
          <div>
            <h3 className="text-sm font-medium">
              {byDomain ? "Дополнительно разрешить" : "Пользователи"}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {byDomain
                ? "Эти пользователи смогут войти с любой почтой. Можно никого не выбирать."
                : "Пустой список запрещает вход всем, включая суперпользователя."}
            </p>
          </div>
          <Input
            aria-label="Найти пользователя по почте"
            placeholder="Найти пользователя по почте"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="max-h-64 space-y-1 overflow-auto rounded-lg border p-2">
            {visibleUsers.map((user) => (
              <label
                key={user.id}
                className="flex cursor-pointer items-center gap-3 rounded-md p-2 hover:bg-muted"
              >
                <Checkbox
                  checked={draft.userIds.includes(user.id)}
                  onCheckedChange={(checked) =>
                    onChange({
                      ...draft,
                      userIds:
                        checked === true
                          ? [...draft.userIds, user.id]
                          : draft.userIds.filter((id) => id !== user.id),
                    })
                  }
                />
                <span className="min-w-0 break-all text-sm">
                  {user.email}
                  {user.status !== "active" && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      Неактивен · вход запрещён
                    </span>
                  )}
                </span>
              </label>
            ))}
            {!visibleUsers.length && (
              <p className="p-3 text-sm text-muted-foreground">
                Пользователи не найдены
              </p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Выбрано: {draft.userIds.length}
          </p>
        </div>
      )}
    </div>
  );
}
