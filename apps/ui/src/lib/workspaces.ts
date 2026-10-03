import { cache } from "react";
import { coreAddress } from "./session";

export interface Workspace { id: string; name: string; description: string; collections: string[] }
export interface WorkspaceSnapshot { workspaces: Workspace[]; selectedId: string | null }
export const loadWorkspaces = cache(async (token: string): Promise<WorkspaceSnapshot> => {
  try {
    const response = await fetch(coreAddress("/workspaces"), { headers: { authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(3000) });
    if (response.ok) return (await response.json() as { data: WorkspaceSnapshot }).data;
  } catch { /* Collections remain usable when workspace loading fails. */ }
  return { workspaces: [], selectedId: null };
});
