"use client";

import { useId, type ReactNode } from "react";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { useUiCopy } from "@/lib/ui-copy";
import { CopyConnectionValue } from "./copy-connection-value";

export function ConnectionField({
  label,
  value,
  onChange,
  disabled,
  readOnly = false,
  type = "text",
  placeholder = "",
}: {
  label: string;
  value: string | number;
  onChange: (value: string) => void;
  disabled: boolean;
  readOnly?: boolean;
  type?: "text" | "number" | "password";
  placeholder?: string;
}) {
  const id = useId();
  const copy = useUiCopy();
  const copyable = readOnly && type !== "password";
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{copy(label)}</Label>
      <div className="relative">
        <Input
          id={id}
          type={type}
          className={copyable ? "h-9 pr-10" : "h-9"}
          value={value}
          disabled={disabled && !copyable}
          readOnly={readOnly}
          placeholder={placeholder}
          autoComplete={type === "password" ? "new-password" : "off"}
          spellCheck={false}
          onChange={(event) => onChange(event.target.value)}
        />
        {copyable && (
          <CopyConnectionValue
            key={String(value)}
            value={String(value)}
            label={copy(label)}
          />
        )}
      </div>
    </div>
  );
}

export function ConnectionSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  options: readonly (readonly [string, string])[];
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  const id = useId();
  const copy = useUiCopy();
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{copy(label)}</Label>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={disabled}
      >
        <SelectTrigger
          id={id}
          className="h-9 w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map(([key, text]) => (
            <SelectItem
              key={key}
              value={key}
            >
              {copy(text)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function ConnectionEnabled({
  value,
  onChange,
  disabled,
}: {
  value: boolean;
  onChange: (value: boolean) => void;
  disabled: boolean;
}) {
  const id = useId();
  const copy = useUiCopy();
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border px-3 py-3">
      <Label htmlFor={id}>{copy("Подключение включено")}</Label>
      <Switch
        id={id}
        checked={value}
        disabled={disabled}
        onCheckedChange={onChange}
      />
    </div>
  );
}

export function ConnectionGrid({ children }: { children: ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2">{children}</div>;
}
