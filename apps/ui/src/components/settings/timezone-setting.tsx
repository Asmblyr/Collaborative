"use client";
import { useState } from "react";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Label } from "@/components/ui/label";
import { useAccountTheme } from "./account-theme";
import { useUiCopy } from "@/lib/ui-copy";

export function TimezoneSetting() {
  const copy = useUiCopy();
  const { timezone, saveTimezone } = useAccountTheme();
  const [value, setValue] = useState(timezone ?? "");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  return (
    <div className="space-y-2">
      <Label htmlFor="profile-timezone">{copy("Часовой пояс")}</Label>
      <div className="flex gap-2">
        <Input
          id="profile-timezone"
          list="profile-timezones"
          value={value}
          disabled={pending}
          placeholder={copy("Как на устройстве")}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button
          size="sm"
          variant="outline"
          disabled={pending || value === (timezone ?? "")}
          onClick={async () => {
            try {
              const canonical = value.trim()
                ? new Intl.DateTimeFormat("en", {
                    timeZone: value.trim(),
                  }).resolvedOptions().timeZone
                : null;
              setPending(true);
              if (await saveTimezone(canonical)) {
                setValue(canonical ?? "");
              }
              setError("");
            } catch {
              setError(copy("Выберите существующий часовой пояс"));
            } finally {
              setPending(false);
            }
          }}
        >
          {copy("Сохранить")}
        </Button>
      </div>
      <datalist id="profile-timezones">
        {Intl.supportedValuesOf("timeZone").map((zone) => (
          <option
            key={zone}
            value={zone}
          />
        ))}
        <option value="UTC" />
      </datalist>
      <p className="text-xs text-muted-foreground">
        {copy(
          "Используется для дат профиля. Пустое значение — часовой пояс устройства.",
        )}
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
