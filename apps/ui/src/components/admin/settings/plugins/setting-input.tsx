import type {
  PluginSettingField,
  PluginSettingValue,
} from "@asmblyr-collaborative/contracts";
import { Checkbox } from "@asmblyr-collaborative/kit/ui/checkbox";
import { Input } from "@asmblyr-collaborative/kit/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";
import { usePluginTranslations } from "@asmblyr-collaborative/kit/ui/i18n";

interface SettingInputProps {
  id: string;
  namespace: string;
  name: string;
  field: PluginSettingField;
  value: PluginSettingValue;
  onChange(value: PluginSettingValue): void;
}

export function SettingInput({
  id,
  namespace,
  name,
  field,
  value,
  onChange,
}: SettingInputProps) {
  const { t } = usePluginTranslations(namespace);
  const describedBy = field.description ? `${id}-description` : undefined;
  if (field.type === "boolean") {
    return (
      <Checkbox
        id={id}
        aria-describedby={describedBy}
        checked={value === true}
        onCheckedChange={(checked) => onChange(checked === true)}
      />
    );
  }
  if (field.type === "select") {
    return (
      <Select
        value={String(value)}
        onValueChange={onChange}
      >
        <SelectTrigger
          id={id}
          aria-describedby={describedBy}
          className="w-full"
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {field.options.map((option) => (
            <SelectItem
              key={option.value}
              value={option.value}
            >
              {t(`settings.${name}.options.${option.value}`, option.label)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.type === "number") {
    return (
      <Input
        id={id}
        aria-describedby={describedBy}
        type="number"
        required
        min={field.min}
        max={field.max}
        step={field.integer ? 1 : "any"}
        value={String(value)}
        onChange={(event) =>
          onChange(event.target.value === "" ? "" : Number(event.target.value))
        }
      />
    );
  }
  return (
    <Input
      id={id}
      aria-describedby={describedBy}
      value={String(value)}
      maxLength={field.maxLength}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
