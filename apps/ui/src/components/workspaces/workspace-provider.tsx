"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { apiRequest } from "@/lib/api-request";
import type { WorkspaceSnapshot } from "@/lib/workspaces";
import { useUiCopy } from "@/lib/ui-copy";
import { workspaceHref, workspaceSelection } from "@/lib/workspace-location";
import { isCollectionPath } from "@/lib/item-location";

function useWorkspaceState(initial: WorkspaceSnapshot) {
  const copy = useUiCopy();

  const router = useRouter(),
    pathname = usePathname();
  const params = useSearchParams();
  const query = params.toString();
  const [snapshot, setSnapshot] = useState(initial),
    [pending, setPending] = useState(false);
  const serverKey = JSON.stringify(initial);
  const [previousServerKey, setPreviousServerKey] = useState(serverKey);
  // RSC can recreate identical props. Preserve newer client fetches in that case;
  // reconcile actual server changes such as renamed collections or revoked grants.
  if (previousServerKey !== serverKey) {
    setPreviousServerKey(serverKey);
    setSnapshot(initial);
  }
  const [error, setError] = useState("");
  const [remembered, setRemembered] = useState(initial.selectedId);
  const selection = workspaceSelection(
    { ...snapshot, selectedId: remembered },
    new URLSearchParams(query),
  );
  if (
    params.has("workspace") &&
    !selection.missing &&
    remembered !== selection.id
  ) {
    setRemembered(selection.id);
  }
  const active = snapshot.workspaces.find((w) => w.id === selection.id) ?? null;
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("workspace")) {
      window.history.replaceState(
        null,
        "",
        workspaceHref(
          window.location.pathname +
            window.location.search +
            window.location.hash,
          active?.id ?? null,
        ),
      );
    }
  }, [pathname, query, active?.id]);
  async function reload() {
    setSnapshot(await apiRequest<WorkspaceSnapshot>("/api/workspaces"));
  }
  async function select(id: string | null) {
    if (pending) {
      return;
    }
    const previousHref = window.location.href;
    setPending(true);
    setError("");
    try {
      await apiRequest("/api/users/me/workspace", "PUT", { workspaceId: id });
      setSnapshot((s) => ({ ...s, selectedId: id }));
      setRemembered(id);
      if (window.location.href !== previousHref) {
        return;
      }
      const next = snapshot.workspaces.find((workspace) => workspace.id === id);
      if (
        next &&
        pathname.startsWith("/items/") &&
        !next.collections.some((name) => isCollectionPath(pathname, name))
      ) {
        router.push(workspaceHref("/", id));
      } else {
        const href = workspaceHref(
          window.location.pathname +
            window.location.search +
            window.location.hash,
          id,
          true,
        );
        if (
          href !==
          window.location.pathname +
            window.location.search +
            window.location.hash
        ) {
          window.history.pushState(null, "", href);
        }
        router.refresh();
      }
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : copy("Не удалось переключить workspace"),
      );
    } finally {
      setPending(false);
    }
  }
  return {
    ...snapshot,
    selectedId: selection.id,
    active,
    pending,
    error: selection.missing
      ? copy(
          "Workspace из ссылки недоступен. Показаны все доступные коллекции.",
        )
      : error,
    reload,
    select,
    href: (target: string) => workspaceHref(target, active?.id ?? null),
    includes: (name: string) => !active || active.collections.includes(name),
  };
}

const Context = createContext<ReturnType<typeof useWorkspaceState> | null>(
  null,
);
export function WorkspaceProvider({
  initial,
  children,
}: {
  initial: WorkspaceSnapshot;
  children: React.ReactNode;
}) {
  const state = useWorkspaceState(initial);
  return <Context.Provider value={state}>{children}</Context.Provider>;
}
export function useWorkspace() {
  return useContext(Context);
}
