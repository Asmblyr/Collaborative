import { presencePages, type PresenceScope } from "@asmblyr/contracts";
import { isCollectionPath } from "@/lib/item-location";

/** Query strings, filters and searched text never become shared presence scopes. */
export function pagePresenceScope(
  pathname: string,
  collection?: string,
): PresenceScope | null {
  if (collection && isCollectionPath(pathname, collection)) {
    return { kind: "collection", collection };
  }
  if (presencePages.includes(pathname as (typeof presencePages)[number])) {
    return { kind: "page", page: pathname as (typeof presencePages)[number] };
  }
  return null;
}
