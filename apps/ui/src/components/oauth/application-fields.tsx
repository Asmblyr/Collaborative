"use client";

import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@asmblyr/kit/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ApplicationAccess } from "./application-access";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@asmblyr/kit/ui/tabs";
import type { ApplicationDraft, OAuthUser } from "./types";

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
        <TabsTrigger value="general">Приложение</TabsTrigger>
        <TabsTrigger value="access">Доступ</TabsTrigger>
        <TabsTrigger value="service">Интеграция</TabsTrigger>
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
            <Label htmlFor="oauth-name">Название</Label>
            <Input
              id="oauth-name"
              required
              maxLength={120}
              value={draft.name}
              onChange={(event) => change("name", event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="oauth-description">Описание</Label>
            <Input
              id="oauth-description"
              maxLength={1000}
              value={draft.description}
              onChange={(event) => change("description", event.target.value)}
              placeholder="Покажем пользователю перед входом"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="oauth-kind">Тип приложения</Label>
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
                  Серверное · с секретом
                </SelectItem>
                <SelectItem value="public">
                  Публичное · без секрета, PKCE
                </SelectItem>
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Для LavinMQ выберите публичное. PKCE обязателен для обоих типов.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="oauth-redirects">Адреса возврата</Label>
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
              По одному точному адресу на строку. HTTP разрешён только для
              localhost.
            </p>
          </div>
          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <Label htmlFor="oauth-enabled">Приложение включено</Label>
              <p className="mt-1 text-xs text-muted-foreground">
                Отключение запрещает новые входы и обмен кодов.
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
            <p className="font-medium">Единый профиль</p>
            <p className="mt-2 text-muted-foreground">
              ID, почта, имя и изображение. Набор одинаков для всех приложений.
              Пароль и доступ к данным Asmblyr не передаются.
            </p>
          </div>
          <ApplicationAccess
            draft={draft}
            onChange={onChange}
            users={users}
            portal={portal}
          />
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
            Для обычного входа оставьте пустым. Если сервис проверяет JWT и
            права в нём, укажите его настройки ниже.
          </p>
          <div className="space-y-2">
            <Label htmlFor="oauth-audience">Аудитория токена (audience)</Label>
            <Input
              id="oauth-audience"
              maxLength={200}
              value={draft.audience}
              onChange={(event) => change("audience", event.target.value)}
              placeholder="Например, lavinmq"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="oauth-scopes">Разрешённые scopes сервиса</Label>
            <Textarea
              id="oauth-scopes"
              rows={5}
              value={draft.scopes.join("\n")}
              onChange={(event) =>
                change("scopes", event.target.value.split("\n"))
              }
              placeholder={"lavinmq.tag:monitoring\nlavinmq.read:%2F/*"}
            />
            <p className="text-xs text-muted-foreground">
              По одному на строку. Сервис может запросить эти права для любого
              пользователя из вкладки «Доступ». Это не настройка полей профиля.
            </p>
          </div>
          <p className="rounded-lg border p-4 text-xs leading-relaxed text-muted-foreground">
            Токены действуют 5 минут. Уже выданный JWT может приниматься
            сервисом до истечения этого срока. Для новых прав или отзыва доступа
            повторный вход обязателен.
          </p>
        </fieldset>
      </TabsContent>
    </Tabs>
  );
}
