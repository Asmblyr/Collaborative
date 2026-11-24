import { normalizedEmail } from "../validation.js";
import type { OAuth2ProfileMapping, SsoProvider } from "./config.js";

export interface ExternalProfile {
  email?: string;
  emailVerified: boolean;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
  picture: string | null;
}

export const oidcProfileMapping: OAuth2ProfileMapping = {
  emailKey: "email",
  emailVerifiedKey: "email_verified",
  firstNameKey: "given_name",
  lastNameKey: "family_name",
  displayNameKey: "name",
  pictureKey: "picture",
};

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/;
const MAX_NAME_LENGTH = 120;
const MAX_PICTURE_URL_LENGTH = 2048;
const MAX_DATA_URI_LENGTH = 2_900_000;

export function readPropertyPath(source: unknown, path: string): unknown {
  let value: unknown = source;
  for (const part of path.split(".")) {
    if (!value || typeof value !== "object" || !Object.hasOwn(value, part)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[part];
  }
  return value;
}

function sanitizeName(value: unknown): string | null {
  if (typeof value !== "string" || CONTROL_CHARS.test(value)) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, MAX_NAME_LENGTH).trim() || null;
}

function sanitizePicture(value: unknown): string | null {
  if (typeof value !== "string" || CONTROL_CHARS.test(value)) {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  if (trimmed.startsWith("data:")) {
    return trimmed.length <= MAX_DATA_URI_LENGTH ? trimmed : null;
  }
  return trimmed.length <= MAX_PICTURE_URL_LENGTH ? trimmed : null;
}

function parseOptionalEmail(value: unknown): string | undefined {
  try {
    return normalizedEmail(value);
  } catch {
    return undefined;
  }
}

export function extractExternalProfile(
  source: unknown,
  mapping: OAuth2ProfileMapping = oidcProfileMapping,
): ExternalProfile {
  const email = parseOptionalEmail(readPropertyPath(source, mapping.emailKey));
  const emailVerified =
    readPropertyPath(source, mapping.emailVerifiedKey) === true;

  return {
    email,
    emailVerified,
    firstName: sanitizeName(readPropertyPath(source, mapping.firstNameKey)),
    lastName: sanitizeName(readPropertyPath(source, mapping.lastNameKey)),
    displayName: sanitizeName(readPropertyPath(source, mapping.displayNameKey)),
    picture: sanitizePicture(readPropertyPath(source, mapping.pictureKey)),
  };
}

export function mergeExternalProfiles(
  primary: ExternalProfile,
  fallback: ExternalProfile,
  requireVerifiedEmail: boolean,
): ExternalProfile {
  let email = primary.email;
  let emailVerified = primary.emailVerified;

  const primarySatisfiesEmail =
    Boolean(primary.email) && (!requireVerifiedEmail || primary.emailVerified);

  if (!primarySatisfiesEmail && fallback.email) {
    email = fallback.email;
    emailVerified =
      fallback.emailVerified ||
      (primary.email === fallback.email && primary.emailVerified);
  }

  return {
    email,
    emailVerified,
    firstName: primary.firstName ?? fallback.firstName,
    lastName: primary.lastName ?? fallback.lastName,
    displayName: primary.displayName ?? fallback.displayName,
    picture: primary.picture ?? fallback.picture,
  };
}

export function needsUserInfoFallback(
  provider: SsoProvider,
  profile: ExternalProfile,
): boolean {
  if (!provider.autoLinkByEmail && !provider.autoProvision) {
    return false;
  }

  if (!profile.email) {
    return true;
  }
  if (provider.requireVerifiedEmail && !profile.emailVerified) {
    return true;
  }
  if (
    provider.autoProvision &&
    !profile.firstName &&
    !profile.lastName &&
    !profile.displayName
  ) {
    return true;
  }
  return false;
}

export function needsPictureUserInfo(
  provider: SsoProvider,
  profile: ExternalProfile,
): boolean {
  return provider.avatarSync !== "off" && !profile.picture;
}

export function eligibleEmailForSso(
  provider: SsoProvider,
  profile: ExternalProfile,
): string | null {
  if (!profile.email) {
    return null;
  }
  if (provider.requireVerifiedEmail && !profile.emailVerified) {
    return null;
  }
  if (provider.allowedEmailDomains.length > 0) {
    const domain = profile.email.slice(profile.email.lastIndexOf("@") + 1);
    if (!provider.allowedEmailDomains.includes(domain)) {
      return null;
    }
  }
  return profile.email;
}
