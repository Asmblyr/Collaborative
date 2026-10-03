import { Input } from "@asmblyr/kit/ui/input";
import { Label } from "@/components/ui/label";
const namePattern = "[a-z][a-z0-9_]*";
export function NameInput({
  id,
  label,
  value,
  onChange,
  required = false,
  hint,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required={required}
        maxLength={63}
        pattern={namePattern}
        className="h-10 font-mono"
      />
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
