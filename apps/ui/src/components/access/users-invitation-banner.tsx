"use client";

import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { showToast } from "@/components/ui/toast";
import { useUiCopy } from "@/lib/ui-copy";

export interface IssuedInvitation {
  email: string;
  token: string;
  expiresAt: string;
  policyName?: string | null;
}

export interface BulkIssuedInvitations {
  created: {
    email: string;
    userId: string;
    invitationToken: string;
    expiresAt: string;
  }[];
  skipped: {
    email: string;
    reason: string;
    message: string;
  }[];
  policyName?: string | null;
}

function buildInvitationUrl(token: string): string {
  return typeof window !== "undefined"
    ? `${window.location.origin}/invite#token=${encodeURIComponent(token)}`
    : "";
}

export function UsersInvitationBanner({
  invite,
}: {
  invite: IssuedInvitation;
}) {
  const copy = useUiCopy();
  const invitationUrl = buildInvitationUrl(invite.token);

  async function copyInvitationUrl() {
    try {
      await navigator.clipboard.writeText(invitationUrl);
      showToast(copy("Ссылка скопирована"), "success");
    } catch {
      showToast(copy("Не удалось скопировать в буфер обмена"), "error");
    }
  }

  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
      <p className="font-medium">
        {copy("Ссылка для")} {invite.email}{" "}
        {copy("показана один раз. Действует до")}{" "}
        {new Date(invite.expiresAt).toLocaleString(
          copy.locale === "en" ? "en-US" : "ru-RU",
        )}
        .
        {invite.policyName && (
          <span className="ml-1 font-normal text-muted-foreground">
            ({copy("Начальная политика")}: {invite.policyName})
          </span>
        )}
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
          onClick={() => void copyInvitationUrl()}
        >
          {copy("Копировать")}
        </Button>
      </div>
    </div>
  );
}

export function BulkInvitationsBanner({
  result,
  onDismiss,
}: {
  result: BulkIssuedInvitations;
  onDismiss?: () => void;
}) {
  const copy = useUiCopy();

  async function copyText(text: string, successMessage: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast(successMessage, "success");
    } catch {
      showToast(copy("Не удалось скопировать в буфер обмена"), "error");
    }
  }

  function copyAllLinks() {
    const lines = result.created.map(
      (item) => `${item.email} — ${buildInvitationUrl(item.invitationToken)}`,
    );
    void copyText(lines.join("\n"), copy("Все ссылки скопированы"));
  }

  return (
    <div className="space-y-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">
          {copy("Создано приглашений: {{value0}}, пропущено: {{value1}}", {
            value0: result.created.length,
            value1: result.skipped.length,
          })}
          {result.policyName && (
            <span className="ml-1 font-normal text-muted-foreground">
              ({copy("Начальная политика")}: {result.policyName})
            </span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {result.created.length > 0 && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={copyAllLinks}
            >
              {copy("Копировать все ссылки")}
            </Button>
          )}
          {onDismiss && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onDismiss}
            >
              {copy("Закрыть")}
            </Button>
          )}
        </div>
      </div>
      {result.created.length > 0 && (
        <div className="max-h-60 space-y-2 overflow-y-auto pr-1">
          {result.created.map((item) => {
            const url = buildInvitationUrl(item.invitationToken);
            return (
              <div
                key={item.userId}
                className="flex flex-wrap items-center gap-2 rounded-md border bg-background/80 p-2"
              >
                <span className="min-w-40 truncate text-xs font-medium">
                  {item.email}
                </span>
                <Input
                  readOnly
                  aria-label={`${copy("Ссылка приглашения")}: ${item.email}`}
                  value={url}
                  className="h-8 min-w-52 flex-1 text-xs"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs"
                  onClick={() => void copyText(url, copy("Ссылка скопирована"))}
                >
                  {copy("Копировать")}
                </Button>
              </div>
            );
          })}
        </div>
      )}
      {result.skipped.length > 0 && (
        <div className="space-y-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
          <p className="font-medium text-amber-900 dark:text-amber-200">
            {copy("Пропущенные адреса")}
          </p>
          <ul className="space-y-1 text-muted-foreground">
            {result.skipped.map((item, index) => (
              <li key={`${item.email}-${index}`}>
                <span className="font-medium text-foreground">
                  {item.email}
                </span>{" "}
                — {item.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
