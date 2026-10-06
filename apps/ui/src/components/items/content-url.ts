export function safeContentUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    if (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !/\s/.test(value)
    ) {
      return value;
    }
  } catch {
    // An incomplete draft must never become a navigation target.
  }
  return undefined;
}
