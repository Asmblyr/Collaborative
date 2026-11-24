const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+$/;

function firstTokenCharacter(token: string): string {
  const cleaned = token.replace(/^[^\p{L}\p{N}]+/u, "");
  return Array.from(cleaned)[0] ?? "";
}

/**
 * Extracts 1–2 uppercase initials from a resolved user display label
 * (display name, "Name (email)", or fallback email address).
 */
export function extractUserInitials(label?: string | null): string {
  const trimmed = label?.trim() ?? "";
  if (!trimmed) {
    return "";
  }
  const withoutParens = trimmed.replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const base = withoutParens || trimmed;
  const parts = EMAIL_PATTERN.test(base)
    ? base
        .slice(0, base.indexOf("@"))
        .split(/[._+-]+/)
        .filter(Boolean)
    : base.split(/\s+/).filter(Boolean);

  return parts
    .map(firstTokenCharacter)
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toLocaleUpperCase();
}
