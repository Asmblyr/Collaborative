export function safeNext(value: string | null): string {
  if (!value?.startsWith("/") || value.startsWith("//") || value.includes("\\")) return "/";
  try {
    const base = "http://localhost";
    const target = new URL(value, base);
    if (target.origin !== base || target.pathname.startsWith("//")) return "/";
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return "/"; }
}
