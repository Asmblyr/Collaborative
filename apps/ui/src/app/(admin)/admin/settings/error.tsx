"use client";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useUiCopy } from "@/lib/ui-copy";

export default function SettingsError({ reset }: { reset: () => void }) {
  const copy = useUiCopy();

  return (
    <div
      role="alert"
      className="space-y-4 rounded-xl border p-6"
    >
      <p>
        {copy(
          "Не удалось загрузить раздел настроек. Проверьте подключение и попробуйте снова. ",
        )}
      </p>
      <Button
        variant="outline"
        onClick={reset}
      >
        {copy("Попробовать снова ")}
      </Button>
    </div>
  );
}
