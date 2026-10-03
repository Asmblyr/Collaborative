import { useRef, type ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@asmblyr/kit/ui/input";

export function ItemFilterMenu({
  query,
  onQueryChange,
  placeholder,
  maxLength,
  children,
}: {
  query: string;
  onQueryChange: (value: string) => void;
  placeholder: string;
  maxLength?: number;
  children: ReactNode;
}) {
  const list = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  return (
    <>
      <div className="relative m-2">
        <Search
          aria-hidden="true"
          className="absolute left-2.5 top-2 size-4 text-muted-foreground"
        />
        <Input
          ref={search}
          autoFocus
          aria-label={placeholder}
          placeholder={placeholder}
          value={query}
          maxLength={maxLength}
          className="h-8 pl-8"
          onChange={(event) => onQueryChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              list.current
                ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
                ?.focus();
            }
            if (event.key === "Enter") {
              event.preventDefault();
              list.current
                ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
                ?.click();
            }
          }}
        />
      </div>
      <div
        ref={list}
        className="max-h-72 overflow-y-auto p-1.5 pt-0"
        onKeyDown={(event) => {
          if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          );
          const index = buttons.indexOf(event.target as HTMLButtonElement);
          if (index < 0) return;
          event.preventDefault();
          const next = index + (event.key === "ArrowDown" ? 1 : -1);
          if (next < 0) search.current?.focus();
          else buttons[Math.min(next, buttons.length - 1)]?.focus();
        }}
      >
        {children}
      </div>
    </>
  );
}
