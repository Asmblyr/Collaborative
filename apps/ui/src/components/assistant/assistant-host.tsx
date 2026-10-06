"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/components/workspaces/workspace-provider";
import type { PageContext } from "./assistant-context-types";

interface RecordHost {
  container: HTMLDialogElement;
  pathname: string;
  context: PageContext;
}

function useHostState() {
  const pathname = usePathname();
  const workspaceId = useWorkspace()?.active?.id ?? null;
  const [hosts, setHosts] = useState<RecordHost[]>([]);
  const [open, setOpen] = useState(false);
  const [contextEnabled, setContextEnabled] = useState(true);
  const [dataEnabled, setDataEnabled] = useState(true);
  const [available, setAvailable] = useState(false);
  const host = hosts.findLast(
    (entry) =>
      entry.pathname === pathname && entry.context.workspaceId === workspaceId,
  );
  const register = useCallback((entry: RecordHost) => {
    setHosts((previous) => [...previous, entry]);
    return () => {
      setHosts((previous) => previous.filter((value) => value !== entry));
    };
  }, []);

  function askRecord() {
    setContextEnabled(true);
    setOpen(true);
  }

  return {
    host,
    register,
    open,
    setOpen,
    contextEnabled,
    setContextEnabled,
    dataEnabled,
    setDataEnabled,
    available,
    setAvailable,
    askRecord,
  };
}

const Context = createContext<ReturnType<typeof useHostState> | null>(null);

export function AssistantHostProvider({ children }: { children: ReactNode }) {
  const value = useHostState();
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useAssistantHost() {
  return useContext(Context);
}

/** Owns the top-layer host for a saved record, including nested record editors. */
export function AssistantRecordHost({
  container,
  collection,
  id,
}: {
  container: HTMLDialogElement | null;
  collection: string;
  id: string;
}) {
  const register = useAssistantHost()?.register;
  const pathname = usePathname();
  const workspaceId = useWorkspace()?.active?.id ?? null;

  useEffect(() => {
    if (!register || !container || !id || id.startsWith("draft:")) {
      return;
    }
    return register({
      container,
      pathname,
      context: { page: "items", workspaceId, collection, record: { id } },
    });
  }, [register, container, pathname, workspaceId, collection, id]);

  return null;
}
