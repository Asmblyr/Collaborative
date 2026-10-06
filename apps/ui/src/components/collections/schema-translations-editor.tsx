"use client";

import { useId } from "react";
import { Languages, ChevronDown } from "lucide-react";
import {
  uiLocales,
  type LabelTranslations,
} from "@asmblyr-collaborative/contracts";
import { useTranslations } from "@asmblyr-collaborative/kit/ui/i18n";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Textarea } from "@asmblyr-collaborative/kit/ui/textarea";
import { Label } from "@/components/ui/label";
import { useUiCopy } from "@/lib/ui-copy";

const labelLimits = { label: 120, description: 1000, placeholder: 255 };

export function SchemaTranslationsEditor({
  value = {},
  collection = false,
  disabled,
  onChange,
}: {
  value?: LabelTranslations;
  collection?: boolean;
  disabled: boolean;
  onChange(value: LabelTranslations): void;
}) {
  const copy = useUiCopy();

  const { t } = useTranslations();
  const id = useId();
  const keys = collection
    ? (["label"] as const)
    : (["label", "description", "placeholder"] as const);
  return (
    <details className="group rounded-lg border bg-muted/20">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-sm font-medium">
        <Languages className="size-4 text-primary" />
        {t("schema.translations")}
        <ChevronDown className="ml-auto size-4 text-muted-foreground group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t p-3">
        <p className="text-xs text-muted-foreground">
          {t("schema.translationsHint")}
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {uiLocales.map((locale) => (
            <fieldset
              key={locale}
              className="min-w-0 space-y-3"
              disabled={disabled}
            >
              <legend className="mb-2 text-sm font-medium">
                {locale === "ru" ? copy("Русский") : "English"}
              </legend>
              {keys.map((key) => {
                const controlId = `${id}-${locale}-${key}`;
                const props = {
                  id: controlId,
                  value: value[locale]?.[key] ?? "",
                  maxLength: labelLimits[key],
                  onChange: (
                    e: React.ChangeEvent<
                      HTMLInputElement | HTMLTextAreaElement
                    >,
                  ) =>
                    onChange({
                      ...value,
                      [locale]: { ...value[locale], [key]: e.target.value },
                    }),
                };
                return (
                  <div
                    key={key}
                    className="space-y-1.5"
                  >
                    <Label htmlFor={controlId}>{t(`schema.${key}`)}</Label>
                    {key === "description" ? (
                      <Textarea
                        {...props}
                        className="min-h-16"
                      />
                    ) : (
                      <Input {...props} />
                    )}
                  </div>
                );
              })}
            </fieldset>
          ))}
        </div>
      </div>
    </details>
  );
}
