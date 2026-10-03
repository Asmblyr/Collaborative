"use client";

import {
  Monitor,
  Moon,
  Sun,
  UserRound,
  ShieldCheck,
  Palette,
  AppWindow,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@asmblyr/kit/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@asmblyr/kit/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import type { SessionUser } from "@/lib/session";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";
import { SessionsPanel } from "./sessions-panel";
import { ConnectedAppsPanel } from "./connected-apps-panel";
import { useAccountTheme } from "./account-theme";
import { IdentitiesPanel } from "./identities-panel";
import { ssoMessage, type LoginProvider } from "@/lib/sso";
import { PasskeysPanel } from "./passkeys-panel";
import { InitialPasswordForm } from "./initial-password-form";

const subscribe = () => () => {};

function Appearance() {
  const { theme } = useTheme();
  const { saveTheme, error, ready } = useAccountTheme();
  const mounted = useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
  return (
    <div className="space-y-5">
      <div
        role="group"
        aria-label="Цветовая тема"
        className="grid grid-cols-1 gap-3 sm:grid-cols-3"
      >
        {[
          { id: "light", name: "Светлая", Icon: Sun },
          { id: "dark", name: "Тёмная", Icon: Moon },
          { id: "system", name: "Как в системе", Icon: Monitor },
        ].map(({ id, name, Icon }) => (
          <Button
            key={id}
            variant="outline"
            type="button"
            disabled={!ready}
            aria-pressed={mounted && theme === id}
            onClick={() => saveTheme(id as "light" | "dark" | "system")}
            className="block h-auto space-y-3 rounded-xl p-3 text-left aria-pressed:border-primary aria-pressed:ring-1 aria-pressed:ring-primary"
          >
            <div
              className={`flex h-20 gap-2 rounded-md border p-2 ${id === "dark" ? "bg-zinc-950" : id === "light" ? "bg-zinc-100" : "bg-linear-to-r from-zinc-100 to-zinc-900"}`}
            >
              <div className="w-5 rounded-sm bg-zinc-400/30" />
              <div className="flex-1 space-y-2 pt-1">
                <div className="h-2 w-2/3 rounded bg-zinc-400/50" />
                <div className="h-8 rounded bg-zinc-400/20" />
              </div>
            </div>
            <span className="flex items-center gap-2 text-sm font-medium">
              <Icon className="size-4" />
              {name}
            </span>
          </Button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Тема, порядок и видимость столбцов сохраняются в вашем профиле и
        доступны в других браузерах.
      </p>
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
    </div>
  );
}

export function SettingsWorkspace({
  user,
  providers = [],
  initialTab,
  ssoStatus,
}: {
  user: SessionUser;
  providers?: LoginProvider[];
  initialTab?: string;
  ssoStatus?: string;
}) {
  const name = user.displayName || user.email.split("@")[0];
  const message = ssoMessage(ssoStatus);
  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <PageHeader
        title="Настройки пользователя"
        description="Ваш профиль, безопасность и оформление рабочего пространства."
      />
      <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-xl border bg-card p-6">
          <Avatar className="mb-4 size-14">
            {user.pictureUrl && (
              <AvatarImage
                src={user.pictureUrl}
                alt=""
                referrerPolicy="no-referrer"
              />
            )}
            <AvatarFallback className="bg-primary/10 text-xl font-medium text-primary">
              {name.slice(0, 1).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <h2 className="break-words font-semibold">{name}</h2>
          <p className="mt-1 break-all text-sm text-muted-foreground">
            {user.email}
          </p>
          <Badge
            variant="secondary"
            className="mt-4"
          >
            {user.superuser ? "Суперпользователь" : "Пользователь"}
          </Badge>
        </aside>
        <Tabs
          defaultValue={
            initialTab === "security" || initialTab === "applications"
              ? initialTab
              : "profile"
          }
          className="min-w-0 space-y-5"
        >
          <TabsList className="h-auto w-full justify-start overflow-x-auto">
            <TabsTrigger
              value="profile"
              className="gap-2"
            >
              <UserRound className="size-4" />
              Профиль
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="gap-2"
            >
              <ShieldCheck className="size-4" />
              Безопасность
            </TabsTrigger>
            <TabsTrigger
              value="appearance"
              className="gap-2"
            >
              <Palette className="size-4" />
              Оформление
            </TabsTrigger>
            <TabsTrigger
              value="applications"
              className="gap-2"
            >
              <AppWindow className="size-4" />
              Приложения
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="profile"
            forceMount
            className="rounded-xl border bg-card p-5 data-[state=inactive]:hidden sm:p-6"
          >
            <h2 className="mb-1 font-semibold">Личные данные</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Как вы представлены в Asmblyr.
            </p>
            <ProfileForm user={user} />
          </TabsContent>
          <TabsContent
            value="security"
            forceMount
            className="rounded-xl border bg-card p-5 data-[state=inactive]:hidden sm:p-6"
          >
            <h2 className="mb-1 font-semibold">Пароль и вход</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Защитите доступ к своему аккаунту.
            </p>
            {message && (
              <p
                role="status"
                className="mb-5 rounded-lg bg-muted p-3 text-sm"
              >
                {message}
              </p>
            )}
            {user.hasPassword ? <PasswordForm /> : <InitialPasswordForm />}
            <PasskeysPanel />
            <IdentitiesPanel providers={providers} />
            <SessionsPanel />
          </TabsContent>
          <TabsContent
            value="applications"
            className="rounded-xl border bg-card p-5 sm:p-6"
          >
            <ConnectedAppsPanel />
          </TabsContent>
          <TabsContent
            value="appearance"
            forceMount
            className="rounded-xl border bg-card p-5 data-[state=inactive]:hidden sm:p-6"
          >
            <h2 className="mb-1 font-semibold">Цветовая тема</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              Выберите комфортное оформление.
            </p>
            <Appearance />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
