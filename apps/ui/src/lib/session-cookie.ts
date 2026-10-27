/** Reject ambiguous host/domain cookies before converting a browser request to Core Bearer auth. */
export function uniqueSessionCookie(
  header: string | null,
  name: string,
): string | undefined {
  const matches = (header ?? "")
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${name}=`));
  return matches.length === 1
    ? matches[0].slice(name.length + 1) || undefined
    : undefined;
}
