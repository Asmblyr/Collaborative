"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, ShieldCheck } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { apiRequest } from "@/lib/api-request";
import { useUiCopy } from "@/lib/ui-copy";

const APPROVAL_DELAY_SECONDS = 2;

export interface ConsentDetails {
  uid: string;
  userId: string;
  email: string;
  name: string;
  description: string;
  redirectUri: string;
  scopes: string;
  allowed: boolean;
  canReuseConsent: boolean;
}

export function OAuthConsent({ details }: { details: ConsentDetails }) {
  const copy = useUiCopy();

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remainingSeconds, setRemainingSeconds] = useState(
    APPROVAL_DELAY_SECONDS,
  );
  const waitingForApproval = remainingSeconds > 0;

  useEffect(() => {
    if (remainingSeconds === 0) return;
    const timer = window.setTimeout(
      () => setRemainingSeconds(remainingSeconds - 1),
      1000,
    );
    return () => window.clearTimeout(timer);
  }, [remainingSeconds]);

  async function complete(approve: boolean) {
    if (busy) return;
    if (approve && (!details.allowed || waitingForApproval)) return;
    setBusy(true);
    setError("");
    try {
      const result = await apiRequest<{ redirectTo: string }>(
        `/oauth/interaction/${details.uid}/complete`,
        "POST",
        { approve, userId: details.userId },
      );
      window.location.assign(result.redirectTo);
    } catch (error) {
      setError(
        error instanceof Error ? error.message : copy("Не удалось продолжить"),
      );
      setBusy(false);
    }
  }
  const serviceScopes = details.scopes
    .split(" ")
    .filter((scope) => !["openid", "profile", "email"].includes(scope));
  let approvalLabel = copy("Разрешить и войти");
  if (waitingForApproval)
    approvalLabel = copy("Разрешить ({{value0}})", {
      value0: remainingSeconds,
    });
  if (busy) approvalLabel = copy("Входим…");

  return (
    <main className="flex min-h-svh items-center justify-center bg-muted/30 p-6">
      <section className="w-full max-w-md space-y-6 rounded-2xl border bg-card p-7 shadow-sm">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <ShieldCheck className="size-5" />
          Asmblyr
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {copy("Войти в ")}
            {details.name}
          </h1>
          {details.description && (
            <p className="mt-2 text-sm text-muted-foreground">
              {details.description}
            </p>
          )}
        </div>
        <div className="rounded-xl bg-muted/60 p-4">
          <p className="text-xs text-muted-foreground">{copy("Ваш аккаунт")}</p>
          <p className="mt-1 break-all font-medium">{details.email}</p>
        </div>
        {details.allowed ? (
          <div className="space-y-3 text-sm">
            <p>
              {copy(
                "Приложение получит ваш ID, почту, имя и изображение профиля, если они заполнены. ",
              )}
            </p>
            <p className="text-muted-foreground">
              {copy(
                "Это подтверждение личности. Доступ к коллекциям Asmblyr приложению не предоставляется. ",
              )}
            </p>
            <p className="text-muted-foreground">
              {copy(
                "Разрешение сохранится для следующих входов. Отозвать его можно в настройках профиля, на вкладке «Приложения». ",
              )}
            </p>
            {serviceScopes.length > 0 && (
              <div>
                <p className="mb-2 font-medium">
                  {copy("Доступ внутри приложения")}
                </p>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {serviceScopes.map((scope) => (
                    <li
                      className="break-all"
                      key={scope}
                    >
                      {scope}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <p
            role="alert"
            className="text-sm"
          >
            {copy(
              "Вам пока не предоставлен доступ к этому приложению. Обратитесь к администратору. ",
            )}
          </p>
        )}
        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <ArrowUpRight className="size-3 shrink-0" />
          <span className="break-all">
            {new URL(details.redirectUri).origin}
          </span>
        </p>
        {error && (
          <p
            role="alert"
            className="text-sm text-destructive"
          >
            {copy(error)}
          </p>
        )}
        <div className="flex gap-3">
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => complete(false)}
            className="flex-1"
          >
            {copy("Отмена ")}
          </Button>
          {details.allowed && (
            <Button
              disabled={busy || waitingForApproval}
              onClick={() => complete(true)}
              className="flex-1"
            >
              {approvalLabel}
            </Button>
          )}
        </div>
      </section>
    </main>
  );
}
