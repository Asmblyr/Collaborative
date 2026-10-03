"use client";
import { useCallback, useState } from "react";
import type { PresenceScope } from "@asmblyr/contracts";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { usePresence } from "./use-presence";

export function PresenceAvatars({ scope }: { scope: PresenceScope | null }) {
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
      aria-label={`Сейчас здесь: ${data.total}`}
      className="flex shrink-0 -space-x-1.5"
    >
      {visible.map((person) => {
        const name = person.self
          ? `${person.displayName} (вы)`
          : person.displayName;
        const label =
          person.views > 1 ? `${name} · открыто окон: ${person.views}` : name;
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
                    {initials || "У"}
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
              aria-label={`Ещё участников: ${remaining}`}
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
              <p>И ещё {data.total - data.participants.length}</p>
            )}
          </TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}
