import { objectInput } from "../shared/input.js";
import { AuthInputError } from "./validation.js";
import { parseFileId } from "../files/validation.js";

export interface ProfileChanges {
  display_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  description?: string | null;
  picture_url?: string | null;
  avatar_id?: string | null;
}

export function parseProfile(value: unknown): ProfileChanges {
  const input = objectInput(value, [
    "displayName",
    "firstName",
    "lastName",
    "description",
    "pictureUrl",
    "avatarId",
  ]);
  if (!Object.keys(input).length) {
    throw new AuthInputError("No profile fields supplied");
  }
  const result: ProfileChanges = {};
  for (const [key, column] of [
    ["displayName", "display_name"],
    ["firstName", "first_name"],
    ["lastName", "last_name"],
    ["description", "description"],
    ["pictureUrl", "picture_url"],
  ] as const) {
    if (input[key] === undefined) {
      continue;
    }
    const text = input[key];
    const limits = {
      displayName: 120,
      firstName: 120,
      lastName: 120,
      description: 2000,
      pictureUrl: 2048,
    };
    const limit = limits[key];
    const controls =
      key === "description"
        ? /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/
        : /[\u0000-\u001f\u007f]/;
    if (
      text !== null &&
      (typeof text !== "string" || text.length > limit || controls.test(text))
    ) {
      throw new AuthInputError(`Invalid profile field: ${key}`);
    }
    result[column] = typeof text === "string" ? text.trim() || null : null;
  }
  if (result.picture_url) {
    let url: URL;
    try {
      url = new URL(result.picture_url);
    } catch {
      throw new AuthInputError("Profile image requires an HTTPS URL");
    }
    if (url.protocol !== "https:" || url.username || url.password || url.hash) {
      throw new AuthInputError("Profile image requires an HTTPS URL");
    }
  }
  if (input.avatarId !== undefined) {
    if (input.avatarId !== null && typeof input.avatarId !== "string") {
      throw new AuthInputError("Invalid avatar identifier");
    }
    result.avatar_id =
      input.avatarId === null ? null : parseFileId(input.avatarId as string);
  }
  return result;
}
