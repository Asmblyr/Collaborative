"use client";
import { Button } from "@asmblyr/kit/ui/button";

export default function SettingsError({ reset }: { reset: () => void }) {
  return (
    <div
      role="alert"
      className="space-y-4 rounded-xl border p-6"
    >
      <p>
        Не удалось загрузить раздел настроек. Проверьте подключение и попробуйте
        снова.
      </p>
      <Button
        variant="outline"
        onClick={reset}
      >
        Попробовать снова
      </Button>
    </div>
  );
}
