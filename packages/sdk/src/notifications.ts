import type { NotificationResult } from "@asmblyr-collaborative/contracts";
import type { RequestOptions } from "./options.js";
import type { Transport } from "./transport.js";

export interface NotificationsClient {
  list(limit?: number, request?: RequestOptions): Promise<NotificationResult>;
  read(id: string, request?: RequestOptions): Promise<void>;
  readAll(before: string, request?: RequestOptions): Promise<void>;
}

export function createNotificationsClient(
  transport: Transport,
): NotificationsClient {
  return {
    list: (limit = 50, request) =>
      transport.get(
        "/notifications",
        new URLSearchParams({ limit: String(limit) }),
        request,
      ),
    read: (id, request) =>
      transport.write(
        "POST",
        `/notifications/${encodeURIComponent(id)}/read`,
        {},
        request,
      ),
    readAll: (before, request) =>
      transport.write("POST", "/notifications/read-all", { before }, request),
  };
}
