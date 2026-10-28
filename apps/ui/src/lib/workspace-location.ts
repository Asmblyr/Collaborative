import type { WorkspaceSnapshot } from "./workspaces";

export function workspaceSelection(
  snapshot: WorkspaceSnapshot,
  query: URLSearchParams,
): { id: string | null; missing: boolean } {
  const values = query.getAll("workspace");
  if (values.length === 0) {
    return { id: snapshot.selectedId, missing: false };
  }
  if (values.length === 1 && values[0] === "all") {
    return { id: null, missing: false };
  }
  const found =
    values.length === 1 &&
    snapshot.workspaces.some((row) => row.id === values[0]);
  return { id: found ? values[0] : null, missing: !found };
}

/** Keep explicit destinations intact; callers switching workspace may override. */
export function workspaceHref(
  href: string,
  id: string | null,
  replace = false,
): string {
  if (!href.startsWith("/") || href.startsWith("//") || href.includes("\\")) {
    return href;
  }
  const url = new URL(href, "http://navigation.invalid");
  if (replace || !url.searchParams.has("workspace")) {
    url.searchParams.set("workspace", id ?? "all");
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/** Explicit URL context keeps workspace views independent between browser tabs. */
export function workspaceViewQuery(value: unknown): string {
  if (value === undefined) {
    return "";
  }
  const id =
    typeof value === "string" &&
    /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(value)
      ? value
      : "all";
  return `?${new URLSearchParams({ workspaceId: id })}`;
}
