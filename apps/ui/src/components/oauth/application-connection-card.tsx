"use client";

import { useState } from "react";
import { Copy } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@asmblyr-collaborative/kit/ui/label";
import { showToast } from "@/components/ui/toast";
import { useUiCopy } from "@/lib/ui-copy";

export function ApplicationConnectionCard({
  id,
  issuer,
  readOnly,
  confidential,
  secret,
  onRotate,
  onAcknowledgeSecret,
}: {
  id?: string;
  issuer: string;
  readOnly: boolean;
  confidential: boolean;
  secret: string;
  onRotate: () => Promise<boolean>;
  onAcknowledgeSecret: () => void;
}) {
  const copy = useUiCopy();
  const [confirmRotate, setConfirmRotate] = useState(false);

  async function copyValue(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      showToast(copy("Скопировано в буфер обмена"), "success");
    } catch {
      showToast(copy("Не удалось скопировать в буфер обмена"), "error");
    }
  }

  return (
    <>
      {id && (
        <section className="space-y-4 rounded-xl border p-4">
          <h3 className="text-sm font-medium">{copy("Подключение")}</h3>
          <div className="space-y-2">
            <Label htmlFor="oauth-client-id">Client ID</Label>
            <div className="flex gap-2">
              <Input
                id="oauth-client-id"
                readOnly
                value={id}
                className="font-mono text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={copy("Скопировать Client ID")}
                onClick={() => void copyValue(id)}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="oauth-issuer">Issuer</Label>
            <div className="flex gap-2">
              <Input
                id="oauth-issuer"
                readOnly
                value={issuer}
                className="text-xs"
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={copy("Скопировать Issuer")}
                onClick={() => void copyValue(issuer)}
              >
                <Copy className="size-4" />
              </Button>
            </div>
          </div>
          <p className="break-all text-xs text-muted-foreground">
            Discovery: {issuer}/.well-known/openid-configuration
          </p>
          <p className="text-xs text-muted-foreground">
            {copy("Scopes профиля: openid profile email")}
          </p>
          {!readOnly &&
            confidential &&
            (confirmRotate ? (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3">
                <p className="w-full text-xs text-destructive">
                  {copy(
                    "Старый секрет сразу перестанет работать для подключённых сервисов.",
                  )}
                </p>
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  onClick={async () => {
                    if (await onRotate()) {
                      setConfirmRotate(false);
                    }
                  }}
                >
                  {copy("Подтвердить замену секрета")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmRotate(false)}
                >
                  {copy("Отмена")}
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmRotate(true)}
              >
                {copy("Заменить секрет (старый перестанет работать)")}
              </Button>
            ))}
        </section>
      )}
      {secret && (
        <section className="space-y-3 rounded-xl border border-primary/40 bg-primary/5 p-4">
          <Label htmlFor="oauth-secret">
            {copy("Секрет · показывается один раз")}
          </Label>
          <div className="flex gap-2">
            <Input
              id="oauth-secret"
              value={secret}
              readOnly
              autoComplete="off"
              className="font-mono text-xs"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              aria-label={copy("Скопировать секрет")}
              onClick={() => void copyValue(secret)}
            >
              <Copy className="size-4" />
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {copy(
              "Сохраните его в настройках сервиса. После закрытия прочитать секрет снова нельзя.",
            )}
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={onAcknowledgeSecret}
          >
            {copy("Я сохранил секрет")}
          </Button>
        </section>
      )}
    </>
  );
}
