import type { OAuthApplication } from "./types";

export function applicationAccessSummary(
  application: OAuthApplication,
): string {
  if (application.accessMode === "all") return "Все активные пользователи";
  if (application.accessMode === "domains") {
    const domains = application.emailDomains.join(", ");
    if (!application.userIds.length) return domains;
    return `${domains} + ${application.userIds.length} польз.`;
  }
  if (!application.userIds.length) return "Вход запрещён всем";
  return `${application.userIds.length} польз.`;
}
