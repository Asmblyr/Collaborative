const incompleteHeadingPattern = /^#{1,6}\s*$/;
const incompleteTableSeparatorPattern = /^\|?[\s:|-]+\|?\s*$/;

function insideCodeFence(text: string): boolean {
  const fences = text.match(/```/g);
  return Boolean(fences && fences.length % 2 === 1);
}

/** Smooth out trailing partial markdown tokens during live streaming previews. */
export function normalizeStreamingMarkdown(text: string): string {
  const trimmed = text.trimEnd();
  if (!trimmed) {
    return "";
  }

  if (insideCodeFence(trimmed)) {
    return `${trimmed}\n\`\`\``;
  }

  const lines = trimmed.split("\n");
  while (lines.length > 0) {
    const last = lines[lines.length - 1];
    if (
      incompleteHeadingPattern.test(last) ||
      (last.includes("-") &&
        last.includes("|") &&
        incompleteTableSeparatorPattern.test(last))
    ) {
      lines.pop();
      continue;
    }
    break;
  }

  let normalized = lines.join("\n").trimEnd();
  if (!normalized) {
    return "";
  }

  const backticks = normalized.match(/`/g);
  if (backticks && backticks.length % 2 === 1) {
    normalized = normalized.endsWith("`")
      ? normalized.slice(0, -1)
      : `${normalized}\``;
  }

  const boldMarkers = normalized.match(/\*\*/g);
  if (boldMarkers && boldMarkers.length % 2 === 1) {
    normalized = normalized.endsWith("**")
      ? normalized.slice(0, -2)
      : `${normalized}**`;
  }

  return normalized;
}
