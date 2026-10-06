"use client";

import { ExternalLink } from "lucide-react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { safeContentUrl } from "./content-url";
import { useUiCopy } from "@/lib/ui-copy";

export function UrlFieldInput({
  id,
  value,
  disabled,
  required,
  placeholder,
  descriptionId,
  onChange,
}: {
  id: string;
  value: string;
  disabled: boolean;
  required?: boolean;
  placeholder?: string;
  descriptionId?: string;
  onChange(value: string): void;
}) {
  const copy = useUiCopy();

  const href = safeContentUrl(value);
  const icon = (
    <ExternalLink
      aria-hidden="true"
      className="size-4"
    />
  );
  return (
    <div className="flex items-center gap-1">
      <Input
        id={id}
        type="url"
        value={value}
        disabled={disabled}
        required={required}
        placeholder={placeholder}
        aria-describedby={descriptionId}
        className="h-9 min-w-0 flex-1"
        onChange={(event) => onChange(event.target.value)}
      />
      {href ? (
        <Button
          asChild
          size="icon-sm"
          variant="ghost"
          className="size-9 shrink-0"
        >
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={copy("Открыть ссылку в новой вкладке")}
            title={copy("Открыть ссылку")}
          >
            {icon}
          </a>
        </Button>
      ) : (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled
          className="size-9 shrink-0"
          aria-label={copy("Открыть ссылку в новой вкладке")}
        >
          {icon}
        </Button>
      )}
    </div>
  );
}
