import type { NotificationItem } from "@asmblyr-collaborative/contracts";
import { itemHref } from "@/lib/item-location";

export function notificationHref(item: NotificationItem): string {
  const query = new URLSearchParams({
    panel: `plugin:${item.source}:${item.panelId}`,
    target: item.targetId,
  });
  return `${itemHref(item.collection, item.item)}?${query}`;
}
