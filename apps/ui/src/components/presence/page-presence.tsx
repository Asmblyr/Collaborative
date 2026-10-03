"use client";
import { PresenceAvatars } from "./presence-avatars";
import { pagePresenceScope } from "./presence-location";

export function PagePresence({
  pathname,
  collection,
}: {
  pathname: string;
  collection?: string;
}) {
  return <PresenceAvatars scope={pagePresenceScope(pathname, collection)} />;
}
