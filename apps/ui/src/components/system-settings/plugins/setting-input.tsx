import type {
  PluginSettingField,
  PluginSettingValue,
} from "@asmblyr/contracts";
import { Checkbox } from "@asmblyr/kit/ui/checkbox";
import { Input } from "@asmblyr/kit/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";

interface SettingInputProps {
  id: string;
  field: PluginSettingField;
  value: PluginSettingValue;
  onChange(value: PluginSettingValue): void;
}

export function SettingInput({
  id,
  field,
  value,
  onChange,
}: SettingInputProps) {
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
              {option.label}
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
