"use client";
import Link from "next/link";
import { CircleCheck } from "lucide-react";
import { useUiCopy } from "@/lib/ui-copy";

export function CliConnected() {
  const copy = useUiCopy();
  return (
    <section className="w-full space-y-5 rounded-2xl border bg-card p-6 shadow-sm">
      <CircleCheck className="size-6 text-primary" />
      <h1 className="text-xl font-semibold">
        {copy("Подключение подтверждено")}
      </h1>
      <p className="text-sm text-muted-foreground">
        {copy(
          "Вернитесь в терминал. CLI покажет результат получения схемы и генерации типов.",
        )}
      </p>
      <Link
        className="text-sm text-primary underline-offset-4 hover:underline"
        href="/admin/collections"
      >
        {copy("Вернуться в админку")}
      </Link>
    </section>
  );
}
