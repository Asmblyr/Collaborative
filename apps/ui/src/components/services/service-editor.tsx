"use client";

import { useState } from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@asmblyr-collaborative/kit/ui/tabs";
import { apiRequest } from "@/lib/api-request";
import { ServiceKeys } from "./service-keys";
import { ServiceFederations } from "./service-federations";
import type { ServiceDetail, ServicePolicy } from "./types";
import { useUiCopy } from "@/lib/ui-copy";

export function ServiceEditor({
  readOnly = false,
  canManageAll = false,
  delegatablePolicyIds = [],
  initial,
  policies,
  portalContainer,
  onBusy,
  onSaved,
}: {
  readOnly?: boolean;
  canManageAll?: boolean;
  delegatablePolicyIds?: string[];
  initial: ServiceDetail | null;
  policies: ServicePolicy[];
  portalContainer: HTMLDialogElement | null;
  onBusy: (busy: boolean) => void;
  onSaved: (account: ServiceDetail) => void;
}) {
  const copy = useUiCopy();

  const [account, setAccount] = useState(initial);
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [active, setActive] = useState(initial?.status !== "disabled");
  const [policyIds, setPolicyIds] = useState(initial?.policyIds ?? []);
  const [tab, setTab] = useState("settings");
  const [pending, setPending] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (readOnly || pending || keyBusy) {
      return;
    }
    setPending(true);
    onBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await apiRequest<ServiceDetail>(
        `/api/service-accounts${account ? `/${account.id}` : ""}`,
        account ? "PUT" : "POST",
        {
          name,
          description,
          status: active ? "active" : "disabled",
          policyIds,
        },
      );
      setAccount(result);
      setMessage(copy("Настройки сохранены"));
      onSaved(result);
      if (!account) setTab("keys");
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : copy("Не удалось сохранить аккаунт"),
      );
    } finally {
      setPending(false);
      onBusy(false);
    }
  }

  return (
    <Tabs
      value={tab}
      onValueChange={setTab}
      className="space-y-6"
    >
      <TabsList className="h-auto max-w-full flex-wrap">
        <TabsTrigger
          value="settings"
          disabled={keyBusy}
        >
          {copy("Настройки и доступ ")}
        </TabsTrigger>
        <TabsTrigger
          value="keys"
          disabled={!account || pending || keyBusy}
        >
          {copy("Ключи ")}
        </TabsTrigger>
        <TabsTrigger
          value="federations"
          disabled={!account || pending || keyBusy}
        >
          {copy("Федерации ")}
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="settings"
        forceMount
        className="data-[state=inactive]:hidden"
      >
        <form
          onSubmit={save}
          className="space-y-6"
        >
          <fieldset
            disabled={readOnly || pending || keyBusy}
            className="space-y-5"
          >
            <div className="space-y-2">
              <Label htmlFor="service-name">{copy("Название")}</Label>
              <Input
                id="service-name"
                required
                maxLength={120}
                placeholder={copy("Например, импорт каталога")}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="service-description">{copy("Описание")}</Label>
              <Input
                id="service-description"
                maxLength={500}
                placeholder={copy("Для чего используется этот аккаунт")}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-lg border p-4">
              <div>
                <Label htmlFor="service-active">
                  {copy("Аккаунт активен")}
                </Label>
                <p className="mt-1 text-xs text-muted-foreground">
                  {copy("Отключение завершит доступ всех его токенов. ")}
                </p>
              </div>
              <Switch
                id="service-active"
                checked={active}
                onCheckedChange={setActive}
              />
            </div>
            <div className="space-y-3">
              <h3 className="text-sm font-medium">
                {copy("Политики доступа")}
              </h3>
              <p className="text-sm text-muted-foreground">
                {copy(
                  "Выберите, с какими данными может работать сервис. Без политик доступ к данным закрыт. ",
                )}
              </p>
              <div className="max-h-64 space-y-1 overflow-auto rounded-lg border p-2">
                {policies.length === 0 && (
                  <p className="p-3 text-sm text-muted-foreground">
                    {copy(
                      "Создайте политику в разделе «Доступ», затем назначьте её здесь. ",
                    )}
                  </p>
                )}
                {policies.map((policy) => (
                  <Label
                    key={policy.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md p-3 hover:bg-accent"
                  >
                    <Checkbox
                      disabled={
                        readOnly ||
                        (!canManageAll &&
                          !delegatablePolicyIds.includes(policy.id))
                      }
                      checked={policyIds.includes(policy.id)}
                      onCheckedChange={(checked) =>
                        setPolicyIds((current) =>
                          checked === true
                            ? [...current, policy.id]
                            : current.filter((id) => id !== policy.id),
                        )
                      }
                    />
                    <span className="min-w-0 break-words">
                      {policy.name}
                      {!canManageAll &&
                        !delegatablePolicyIds.includes(policy.id) && (
                          <span className="ml-2 text-xs text-muted-foreground">
                            {copy("Только администратор ")}
                          </span>
                        )}
                    </span>
                  </Label>
                ))}
              </div>
            </div>
          </fieldset>
          {error && (
            <p
              role="alert"
              className="text-sm text-destructive"
            >
              {copy(error)}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3">
            {!readOnly && (
              <Button disabled={pending || keyBusy}>
                {pending
                  ? copy("Сохраняем…")
                  : account
                    ? copy("Сохранить")
                    : copy("Создать аккаунт")}
              </Button>
            )}
            {message && (
              <p
                role="status"
                className="text-sm text-muted-foreground"
              >
                {copy(message)}
              </p>
            )}
          </div>
        </form>
      </TabsContent>
      <TabsContent
        value="keys"
        forceMount
        className="data-[state=inactive]:hidden"
      >
        {account && (
          <ServiceKeys
            readOnly={readOnly}
            accountId={account.id}
            active={account.status === "active"}
            initialKeys={account.keys}
            portalContainer={portalContainer}
            onBusy={(busy) => {
              setKeyBusy(busy);
              onBusy(busy);
            }}
          />
        )}
      </TabsContent>
      <TabsContent
        value="federations"
        forceMount
        className="data-[state=inactive]:hidden"
      >
        {account && (
          <ServiceFederations
            readOnly={readOnly}
            accountId={account.id}
            active={account.status === "active"}
            initial={account.federations}
            onBusy={(busy) => {
              setKeyBusy(busy);
              onBusy(busy);
            }}
          />
        )}
      </TabsContent>
    </Tabs>
  );
}
