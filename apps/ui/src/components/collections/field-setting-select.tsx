import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@asmblyr-collaborative/kit/ui/select";

export function FieldSettingSelect({
  label,
  value,
  options,
  disabled,
  container,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled?: boolean;
  container?: HTMLElement | null;
  onChange(value: string): void;
}) {
  return (
    <Select
      value={value}
      disabled={disabled}
      onValueChange={onChange}
    >
      <SelectTrigger
        aria-label={label}
        className="h-9 w-full"
      >
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent container={container}>
        {options.map((option) => (
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
