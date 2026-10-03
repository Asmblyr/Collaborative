import { Input } from "@asmblyr/kit/ui/input";
import { Textarea } from "@asmblyr/kit/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr/kit/ui/select";

interface FieldDefaultInputProps {
  type: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  portalContainer?: HTMLElement | null;
}

export function FieldDefaultInput({
  type,
  value,
  onChange,
  disabled,
  portalContainer,
}: FieldDefaultInputProps) {
  if (type === "json")
    return (
      <Textarea
        id="field-editor-default-value"
        value={value}
        disabled={disabled}
        required
        rows={4}
        className="font-mono text-xs"
        placeholder='{"key": "value"}'
        onChange={(event) => onChange(event.target.value)}
      />
    );
  if (type === "boolean") {
    return (
      <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger id="field-editor-default-value" className="h-10 w-full">
          <SelectValue placeholder="Выберите значение" />
        </SelectTrigger>
        <SelectContent container={portalContainer}>
          <SelectItem value="true">Да</SelectItem>
          <SelectItem value="false">Нет</SelectItem>
        </SelectContent>
      </Select>
    );
  }

  return (
    <Input
      id="field-editor-default-value"
      type={
        type === "integer"
          ? "number"
          : type === "datetime"
            ? "datetime-local"
            : type === "email"
              ? "email"
              : "text"
      }
      value={value}
      onChange={(event) => onChange(event.target.value)}
      disabled={disabled}
      inputMode={type === "decimal" ? "decimal" : undefined}
      required={type !== "text"}
      step={type === "integer" || type === "datetime" ? 1 : undefined}
      min={type === "integer" ? -2147483648 : undefined}
      max={type === "integer" ? 2147483647 : undefined}
      maxLength={type === "email" ? 254 : undefined}
      className="h-10"
    />
  );
}