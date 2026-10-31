"use client";

import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { showToast } from "@/components/ui/toast";
import { useUiCopy } from "@/lib/ui-copy";

export interface IssuedInvitation {
  email: string;
  token: string;
  expiresAt: string;
}

export function UsersInvitationBanner({
  invite,
}: {
  invite: IssuedInvitation;
}) {
  const copy = useUiCopy();
  const invitationUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/invite#token=${encodeURIComponent(invite.token)}`
      : "";

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
