import { AuthInputError } from "./validation.js";

export function parseProfile(value: unknown): {
  display_name: string | null;
  picture_url?: string | null;
} {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new AuthInputError("Invalid profile");
  const input = value as Record<string, unknown>;
  if (
    Object.keys(input).some(
      (key) => !["displayName", "pictureUrl"].includes(key),
    ) ||
    typeof input.displayName !== "string" ||
    input.displayName.trim().length > 120 ||
    /[\u0000-\u001f\u007f]/.test(input.displayName)
  )
    throw new AuthInputError("Invalid display name");
  const result: { display_name: string | null; picture_url?: string | null } = {
    display_name: input.displayName.trim() || null,
  };
  if (input.pictureUrl === undefined) return result;
  if (typeof input.pictureUrl !== "string" || input.pictureUrl.length > 2048)
    throw new AuthInputError("Invalid profile image");
  result.picture_url = input.pictureUrl.trim() || null;
  if (result.picture_url) {
    let url: URL;
    try {
      url = new URL(result.picture_url);
    } catch {
      throw new AuthInputError("Profile image requires an HTTPS URL");
    }
    if (url.protocol !== "https:" || url.username || url.password || url.hash)
      throw new AuthInputError("Profile image requires an HTTPS URL");
  }
  return result;
}
