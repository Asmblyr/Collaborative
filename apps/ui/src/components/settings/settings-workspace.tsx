"use client";

import { UserRound, ShieldCheck, Palette, AppWindow } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@asmblyr-collaborative/kit/ui/tabs";
import { PageHeader } from "@/components/layout/page-header";
import type { SessionUser } from "@/lib/session";
import { PasswordForm } from "./password-form";
import { ProfileForm } from "./profile-form";
import { SessionsPanel } from "./sessions-panel";
import { ConnectedAppsPanel } from "./connected-apps-panel";
import { GoogleConnectionPanel } from "./google-connection-panel";
import { AppearanceSettings } from "./appearance-settings";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import { IdentitiesPanel } from "./identities-panel";
import { ssoMessage, type LoginProvider } from "@/lib/sso";
import { PasskeysPanel } from "./passkeys-panel";
import { InitialPasswordForm } from "./initial-password-form";
import { userDisplayName, userAvatarUrl } from "@/lib/user-profile";
import { ProfileExtensionFields } from "./profile-extension-fields";
import { ProfileDates } from "./profile-dates";
import { ProfileDisplay } from "./profile-display";

export function SettingsWorkspace({
  user,
  providers = [],
  initialTab,
  ssoStatus,
  connectionStatus,
}: {
  user: SessionUser;
  providers?: LoginProvider[];
  initialTab?: string;
  ssoStatus?: string;
  connectionStatus?: string;
}) {
  const { t } = useTranslations();
  const name = userDisplayName(user);
  const message = ssoMessage(ssoStatus);
  return (
    <div className="mx-auto max-w-5xl space-y-7">
      <PageHeader
        title={t("settings.title")}
        description={t("settings.description")}
      />
      <div className="grid items-start gap-6 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="rounded-xl border bg-card p-6">
          <Avatar className="mb-4 size-14">
            {userAvatarUrl(user) && (
              <AvatarImage
                src={userAvatarUrl(user)}
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
            {t(user.superuser ? "settings.admin" : "settings.user")}
          </Badge>
          <ProfileDisplay compact />
          <ProfileDates user={user} />
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
              {t("settings.profile")}
            </TabsTrigger>
            <TabsTrigger
              value="security"
              className="gap-2"
            >
              <ShieldCheck className="size-4" />
              {t("settings.security")}
            </TabsTrigger>
            <TabsTrigger
              value="appearance"
              className="gap-2"
            >
              <Palette className="size-4" />
              {t("settings.appearance")}
            </TabsTrigger>
            <TabsTrigger
              value="applications"
              className="gap-2"
            >
              <AppWindow className="size-4" />
              {t("settings.apps")}
            </TabsTrigger>
          </TabsList>
          <TabsContent
            value="profile"
            forceMount
            className="rounded-xl border bg-card p-5 data-[state=inactive]:hidden sm:p-6"
          >
            <h2 className="mb-1 font-semibold">{t("settings.personal")}</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {t("settings.personalHint")}
            </p>
            <ProfileForm user={user} />
            <ProfileExtensionFields userId={user.id} />
          </TabsContent>
          <TabsContent
            value="security"
            forceMount
            className="rounded-xl border bg-card p-5 data-[state=inactive]:hidden sm:p-6"
          >
            <h2 className="mb-1 font-semibold">{t("settings.password")}</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {t("settings.passwordHint")}
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
            <div className="mt-5">
              <GoogleConnectionPanel feedback={connectionStatus} />
            </div>
          </TabsContent>
          <TabsContent
            value="appearance"
            forceMount
            className="rounded-xl border bg-card p-5 data-[state=inactive]:hidden sm:p-6"
          >
            <h2 className="mb-1 font-semibold">{t("appearance.title")}</h2>
            <p className="mb-6 text-sm text-muted-foreground">
              {t("appearance.hint")}
            </p>
            <AppearanceSettings />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
