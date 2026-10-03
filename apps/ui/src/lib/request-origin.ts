export function hasForeignOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    const actual = new URL(origin);
    const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0];
    const protocol = forwarded
      ? `${forwarded.trim()}:`
      : new URL(request.url).protocol;
    return (
      actual.host !== request.headers.get("host") ||
      actual.protocol !== protocol
    );
  } catch {
    return true;
  }
}
