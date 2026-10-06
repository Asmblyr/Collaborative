import type { ComponentProps } from "react";
import { cn } from "cn";
import { Button } from "@asmblyr-collaborative/kit/ui/button";

export function PolicyPickerTrigger({
  className,
  ...props
}: ComponentProps<typeof Button>) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className={cn(
        "min-h-7 w-full min-w-0 justify-between border-input bg-transparent pr-2 text-sm font-normal shadow-none",
        className,
      )}
      {...props}
    />
  );
}
