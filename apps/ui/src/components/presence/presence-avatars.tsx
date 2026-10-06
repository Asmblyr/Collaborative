"use client";
import { useCallback, useState } from "react";
import type { PresenceScope } from "@asmblyr-collaborative/contracts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePresence } from "./use-presence";
import { useUiCopy } from "@/lib/ui-copy";

export function PresenceAvatars({ scope }: { scope: PresenceScope | null }) {
  const copy = useUiCopy();

  const data = usePresence(scope);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(
    null,
  );
  const mount = useCallback((element: HTMLDivElement | null) => {
    if (element) {
      setPortalContainer(element.closest("dialog"));
    }
  }, []);
  if (!data?.participants.length) {
    return null;
  }
  const visible = data.participants.slice(0, 3);
  const remaining = Math.max(0, data.total - visible.length);
  return (
    <div
      ref={mount}
      role="group"
      aria-label={copy("Сейчас здесь: {{value0}}", { value0: data.total })}
      className="flex shrink-0 -space-x-1.5"
    >
      {visible.map((person) => {
        const name = person.self
          ? copy("{{value0}} (вы)", { value0: person.displayName })
          : person.displayName;
        const label =
          person.views > 1
            ? copy("{{value0}} · открыто окон: {{value1}}", {
                value0: name,
                value1: person.views,
              })
            : name;
        const initials = person.displayName
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((part) => part.slice(0, 1))
          .join("")
          .toLocaleUpperCase();
        return (
          <Tooltip key={person.id}>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label={label}
                className="relative rounded-full outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Avatar className="size-7 border-2 border-background">
                  {person.pictureUrl && (
                    <AvatarImage
                      src={person.pictureUrl}
                      alt=""
                    />
                  )}
                  <AvatarFallback className="bg-muted text-[10px] font-medium">
                    {initials || copy("У")}
                  </AvatarFallback>
                </Avatar>
              </button>
            </TooltipTrigger>
            <TooltipContent
              portalContainer={portalContainer}
              side="bottom"
              sideOffset={6}
            >
              {label}
            </TooltipContent>
          </Tooltip>
        );
      })}
      {remaining > 0 && (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={copy("Ещё участников: {{value0}}", {
                value0: remaining,
              })}
              className="relative flex size-7 items-center justify-center rounded-full border-2 border-background bg-muted text-[10px] font-medium outline-none focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring"
            >
              +{remaining}
            </button>
          </TooltipTrigger>
          <TooltipContent
            portalContainer={portalContainer}
            side="bottom"
            sideOffset={6}
            className="block"
          >
            {data.participants.slice(3).map((person) => (
              <p key={person.id}>{person.displayName}</p>
            ))}
            {data.total > data.participants.length && (
              <p>
                {copy("И ещё ")}
                {data.total - data.participants.length}
              </p>
            )}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
