"use client";

import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@asmblyr-collaborative/kit/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ApplicationAccess } from "./application-access";
import { ApplicationPermissions } from "./application-permissions";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@asmblyr-collaborative/kit/ui/tabs";
import type { ApplicationDraft, OAuthUser } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

interface Props {
  readOnly?: boolean;
  draft: ApplicationDraft;
  onChange: (next: ApplicationDraft) => void;
  users: OAuthUser[];
  existing: boolean;
  portal: HTMLDialogElement | null;
}

export function ApplicationFields({
  readOnly = false,
  draft,
  onChange,
  users,
  existing,
  portal,
}: Props) {
  const copy = useUiCopy();

  function change<K extends keyof ApplicationDraft>(
    key: K,
    value: ApplicationDraft[K],
  ) {
    onChange({ ...draft, [key]: value });
  }
  return (
    <Tabs
      defaultValue="general"
      className="space-y-5"
    >
      <TabsList>
        <TabsTrigger value="general">{copy("Приложение")}</TabsTrigger>
        <TabsTrigger value="access">{copy("Доступ")}</TabsTrigger>
        <TabsTrigger value="service">{copy("Интеграция")}</TabsTrigger>
      </TabsList>
      <TabsContent
        value="general"
        forceMount
        className="space-y-5 data-[state=inactive]:hidden"
      >
        <fieldset
          disabled={readOnly}
          className="space-y-5"
        >
          <div className="space-y-2">
            <Label htmlFor="oauth-name">{copy("Название")}</Label>
            <Input
              id="oauth-name"
              required
              maxLength={120}
              value={draft.name}
              onChange={(event) => change("name", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="oauth-description">{copy("Описание")}</Label>
            <Input
              id="oauth-description"
              maxLength={1000}
              value={draft.description}
              onChange={(event) => change("description", event.target.value)}
              placeholder={copy("Покажем пользователю перед входом")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="oauth-kind">{copy("Тип приложения")}</Label>
            <Select
              disabled={existing}
              value={draft.clientType}
              onValueChange={(value) =>
                change("clientType", value as ApplicationDraft["clientType"])
              }
            >
              <SelectTrigger
                id="oauth-kind"
                className="w-full"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent container={portal}>
                <SelectItem value="confidential">
                  {copy("Серверное · с секретом ")}
                </SelectItem>
                <SelectItem value="public">
                  {copy("Публичное · без секрета, PKCE ")}
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {copy(
                "Для LavinMQ выберите публичное. PKCE обязателен для обоих типов. ",
              )}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="oauth-redirects">{copy("Адреса возврата")}</Label>
            <Textarea
              id="oauth-redirects"
              required
              rows={3}
              value={draft.redirectUris.join("\n")}
              onChange={(event) =>
                change("redirectUris", event.target.value.split("\n"))
              }
              placeholder="https://service.example.com/oauth/callback"
            />
            <p className="text-xs text-muted-foreground">
              {copy(
                "По одному точному адресу на строку. HTTP разрешён только для localhost. ",
              )}
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label htmlFor="oauth-enabled">
                {copy("Приложение включено")}
              </Label>
              <p className="mt-1 text-xs text-muted-foreground">
                {copy("Отключение запрещает новые входы и обмен кодов. ")}
              </p>
            </div>
            <Switch
              id="oauth-enabled"
              checked={draft.enabled}
              onCheckedChange={(value) => change("enabled", value)}
            />
          </div>
        </fieldset>
      </TabsContent>
      <TabsContent
        value="access"
        className="space-y-5"
      >
        <fieldset
          disabled={readOnly}
          className="space-y-5"
        >
          <div className="rounded-lg bg-muted/50 p-4 text-sm">
            <p className="font-medium">{copy("Единый профиль")}</p>
            <p className="mt-2 text-muted-foreground">
              {copy(
                "ID, почта, имя и изображение. Набор одинаков для всех приложений. Пароль и доступ к данным Asmblyr не передаются. ",
              )}
            </p>
          </div>
          <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
            <div className="space-y-2">
              <Label htmlFor="oauth-policy-managed">
                {copy("Управлять доступом через политики")}
              </Label>
              <p className="text-xs text-muted-foreground">
                {copy(
                  "Приложение появится в политиках. Вход и разрешения назначаются пользователям через их политики.",
                )}
              </p>
            </div>
            <Switch
              id="oauth-policy-managed"
              checked={draft.policyManaged}
              onCheckedChange={(value) => change("policyManaged", value)}
            />
          </div>
          {draft.policyManaged ? (
            <p className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
              {copy(
                "После сохранения назначьте приложение хотя бы одной политике. Без разрешения в политике вход закрыт, включая суперпользователей.",
              )}
            </p>
          ) : (
            <ApplicationAccess
              draft={draft}
              onChange={onChange}
              users={users}
              portal={portal}
            />
          )}
        </fieldset>
      </TabsContent>
      <TabsContent
        value="service"
        className="space-y-5"
      >
        <fieldset
          disabled={readOnly}
          className="space-y-5"
        >
          <p className="text-sm text-muted-foreground">
            {copy(
              "Для обычного входа оставьте пустым. Если сервис проверяет JWT и права в нём, укажите его настройки ниже. ",
            )}
          </p>
          <div className="space-y-2">
            <Label htmlFor="oauth-audience">
              {copy("Аудитория токена (audience)")}
            </Label>
            <Input
              id="oauth-audience"
              maxLength={200}
              value={draft.audience}
              onChange={(event) => change("audience", event.target.value)}
              placeholder={copy("Например, lavinmq")}
            />
          </div>
          <ApplicationPermissions
            draft={draft}
            onChange={onChange}
          />
          {draft.policyManaged && (
            <p className="rounded-lg bg-muted/50 p-3 text-xs leading-relaxed text-muted-foreground">
              {copy(
                "В сервисе запрашивайте только openid profile email. Персональные права передаются в JWT: resource_access → аудитория → roles. Для LavinMQ это mgmt_scopes = openid profile email.",
              )}
            </p>
          )}
          <p className="rounded-lg border p-4 text-xs leading-relaxed text-muted-foreground">
            {copy(
              "Токены действуют 5 минут. Уже выданный JWT может приниматься сервисом до истечения этого срока. Для новых прав или отзыва доступа повторный вход обязателен. ",
            )}
          </p>
        </fieldset>
      </TabsContent>
    </Tabs>
  );
}
