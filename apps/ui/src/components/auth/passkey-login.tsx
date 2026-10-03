"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  startAuthentication,
  type PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/browser";
import { KeyRound } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";
import { requestJson as apiRequest } from "@/lib/http-request";

export function PasskeyLogin({ next }: { next: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError("");
          try {
            const options = await apiRequest<{
              challengeId: string;
              options: PublicKeyCredentialRequestOptionsJSON;
            }>("/api/auth/passkeys/options", "POST", {});
            const response = await startAuthentication({
              optionsJSON: options.options,
            });
            await apiRequest("/api/auth/passkeys/login", "POST", {
              challengeId: options.challengeId,
              response,
            });
            router.replace(next);
            router.refresh();
          } catch {
            setError(
              "Не удалось войти с passkey. Попробуйте ещё раз или используйте другой способ входа.",
            );
          } finally {
            setPending(false);
          }
        }}
      >
        <KeyRound className="size-4" />
        {pending ? "Ожидаем passkey…" : "Войти с passkey"}
      </Button>
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
