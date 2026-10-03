"use client";

import { createContext, useContext, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { apiRequest } from "@/lib/api-request";
import type { WorkspaceSnapshot } from "@/lib/workspaces";

function useWorkspaceState(initial: WorkspaceSnapshot) {
  const router = useRouter(),
    pathname = usePathname();
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
  const active =
    snapshot.workspaces.find((w) => w.id === snapshot.selectedId) ?? null;
  async function reload() {
    setSnapshot(await apiRequest<WorkspaceSnapshot>("/api/workspaces"));
  }
  async function select(id: string | null) {
    setPending(true);
    setError("");
    try {
      await apiRequest("/api/users/me/workspace", "PUT", { workspaceId: id });
      setSnapshot((s) => ({ ...s, selectedId: id }));
      const next = snapshot.workspaces.find((workspace) => workspace.id === id);
      if (
        next &&
        pathname.startsWith("/items/") &&
        !next.collections.some(
          (name) => pathname === `/items/${encodeURIComponent(name)}`,
        )
      )
        router.push("/");
      else router.refresh();
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "Не удалось переключить workspace",
      );
    } finally {
      setPending(false);
    }
  }
  return {
    ...snapshot,
    active,
    pending,
    error,
    reload,
    select,
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
