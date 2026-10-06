"use client";

import type { ComponentProps } from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { usePortalContainer } from "@asmblyr-collaborative/kit/ui/portal-container";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function AssistantIconButton({
  label,
  hint = label,
  ...props
}: ComponentProps<typeof Button> & { label: string; hint?: string }) {
  const container = usePortalContainer();

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          {...props}
        />
      </TooltipTrigger>
      <TooltipContent
        side="bottom"
        portalContainer={container}
      >
        {hint}
      </TooltipContent>
    </Tooltip>
  );
}
