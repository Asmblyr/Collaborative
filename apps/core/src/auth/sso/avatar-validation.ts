import { createHash } from "node:crypto";
import { isIP } from "node:net";
import { rasterType } from "../../files/validation.js";

export const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

export type AvatarMimeType = "image/jpeg" | "image/png" | "image/webp";

export interface DownloadedAvatar {
  content: Buffer;
  mimeType: AvatarMimeType;
  sha256: string;
  sourceUrl: string;
}

const DATA_URI_PATTERN =
  /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i;

function parseIpv4(address: string): number[] | null {
  const parts = address.split(".");
  if (parts.length !== 4) {
    return null;
  }
  const octets = parts.map((part) => Number(part));
  if (
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return null;
  }
  return octets;
}

function isBlockedIpv4(octets: number[]): boolean {
  const [a, b, c] = octets;
  if (a === 0 || a === 10 || a === 127) {
    return true;
  }
  if (a === 100 && b >= 64 && b <= 127) {
    return true;
  }
  if (a === 169 && b === 254) {
    return true;
  }
  if (a === 172 && b >= 16 && b <= 31) {
    return true;
  }
  if (a === 192 && b === 0 && (c === 0 || c === 2)) {
    return true;
  }
  if (a === 192 && b === 168) {
    return true;
  }
  if (a === 198 && (b === 18 || b === 19)) {
    return true;
  }
  if (a === 198 && b === 51 && c === 100) {
    return true;
  }
  if (a === 203 && b === 0 && c === 113) {
    return true;
  }
  return a >= 224;
}

function expandIpv6(address: string): number[] | null {
  const withoutZone = address.split("%")[0].toLowerCase();
  let normalized = withoutZone;

  const lastColon = normalized.lastIndexOf(":");
  if (lastColon !== -1 && normalized.includes(".")) {
    const ipv4 = parseIpv4(normalized.slice(lastColon + 1));
    if (!ipv4) {
      return null;
    }
    const hi = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const lo = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    normalized = `${normalized.slice(0, lastColon + 1)}${hi}:${lo}`;
  }

  const halves = normalized.split("::");
  if (halves.length > 2) {
    return null;
  }
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - (left.length + right.length);
  if (halves.length === 1 ? missing !== 0 : missing < 1) {
    return null;
  }

  const groups = [
    ...left,
    ...Array.from({ length: missing }, () => "0"),
    ...right,
  ];
  const values = groups.map((group) =>
    /^[0-9a-f]{1,4}$/.test(group) ? Number.parseInt(group, 16) : Number.NaN,
  );
  if (values.some((value) => Number.isNaN(value))) {
    return null;
  }
  return values;
}

export function isBlockedIp(address: string): boolean {
  const cleaned = address.replace(/^\[|\]$/g, "").split("%")[0];
  const version = isIP(cleaned);
  if (version === 4) {
    const octets = parseIpv4(cleaned);
    return !octets || isBlockedIpv4(octets);
  }
  if (version === 6) {
    const groups = expandIpv6(cleaned);
    if (!groups) {
      return true;
    }
    const allZero = groups.every((group) => group === 0);
    const isLoopback =
      groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1;
    if (allZero || isLoopback) {
      return true;
    }
    // IPv4-mapped (::ffff:0:0/96) and NAT64 (64:ff9b::/96)
    const isIpv4Mapped =
      groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
    const isNat64 =
      groups[0] === 0x0064 &&
      groups[1] === 0xff9b &&
      groups.slice(2, 6).every((group) => group === 0);
    if (isIpv4Mapped || isNat64) {
      return isBlockedIpv4([
        groups[6] >> 8,
        groups[6] & 0xff,
        groups[7] >> 8,
        groups[7] & 0xff,
      ]);
    }
    if (groups[0] === 0x0064 && groups[1] === 0xff9b && groups[2] === 0x0001) {
      return true;
    }
    if (
      groups[0] === 0x0100 &&
      groups.slice(1, 4).every((group) => group === 0)
    ) {
      return true;
    }
    if ((groups[0] & 0xfe00) === 0xfc00) {
      return true;
    }
    if ((groups[0] & 0xffc0) === 0xfe80 || (groups[0] & 0xffc0) === 0xfec0) {
      return true;
    }
    if ((groups[0] & 0xff00) === 0xff00) {
      return true;
    }
    if (groups[0] === 0x2001 && groups[1] === 0x0db8) {
      return true;
    }
    return false;
  }
  return true;
}

export function validateHttpsAvatarUrl(raw: string): URL | null {
  if (!raw || raw.length > 2048 || /[\u0000-\u001f\u007f]/.test(raw)) {
    return null;
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.protocol !== "https:" || url.username || url.password || url.hash) {
    return null;
  }

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  ) {
    return null;
  }

  if (isIP(hostname) && isBlockedIp(hostname)) {
    return null;
  }
  return url;
}

/** Strict raster allowlist for SSO avatars: JPEG, PNG, and WebP only (never SVG). */
export function avatarRasterType(content: Buffer): AvatarMimeType | null {
  const detected = rasterType(content);
  if (
    detected === "image/jpeg" ||
    detected === "image/png" ||
    detected === "image/webp"
  ) {
    return detected;
  }
  return null;
}

export function decodeDataUriAvatar(
  raw: string,
  maxBytes = MAX_AVATAR_BYTES,
): DownloadedAvatar | null {
  const match = DATA_URI_PATTERN.exec(raw);
  if (!match) {
    return null;
  }

  const base64 = match[2].replace(/\s+/g, "");
  const estimatedBytes = Math.ceil((base64.length * 3) / 4);
  if (!base64.length || estimatedBytes > maxBytes) {
    return null;
  }

  const content = Buffer.from(base64, "base64");
  if (!content.length || content.length > maxBytes) {
    return null;
  }

  const mimeType = avatarRasterType(content);
  if (!mimeType) {
    return null;
  }

  const sha256 = createHash("sha256").update(content).digest("hex");
  return {
    content,
    mimeType,
    sha256,
    sourceUrl: `data:sha256:${sha256}`,
  };
}
