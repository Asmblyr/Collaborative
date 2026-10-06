import type { CurrentUser } from "@asmblyr-collaborative/contracts";

export function userDisplayName(
  user: Pick<CurrentUser, "displayName" | "firstName" | "lastName" | "email">,
): string {
  return (
    user.displayName ||
    [user.firstName, user.lastName].filter(Boolean).join(" ") ||
    user.email
  );
}

export function userAvatarUrl(
  user: Pick<CurrentUser, "avatarId" | "pictureUrl">,
): string | undefined {
  return user.avatarId
    ? `/api/files/${user.avatarId}/content?preview=1`
    : user.pictureUrl || undefined;
}
