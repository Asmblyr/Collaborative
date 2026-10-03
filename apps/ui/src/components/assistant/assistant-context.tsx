"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { usePathname } from "next/navigation";
import { useWorkspace } from "@/components/workspaces/workspace-provider";
import { apiRequest } from "@/lib/api-request";
import {
  canApplyProposal,
  type PageContext,
  type FilterProposal,
} from "./assistant-context-types";

interface Registration {
  pathname: string;
  context: PageContext;
  apply: (filter: string) => void;
}
interface ContextValue {
  context: PageContext | null;
  collectionDisplayName: (name: string) => string | undefined;
  workspaceName: string | null;
  publish: (value: Registration) => () => void;
  apply: (proposal: FilterProposal) => Promise<void>;
}
const Context = createContext<ContextValue | null>(null);

export function AssistantContextProvider({
  children,
  collections,
}: {
  children: React.ReactNode;
  collections: readonly { name: string; displayName?: string | null }[];
}) {
  const pathname = usePathname();
  const workspace = useWorkspace();
  const workspaceId = workspace?.active?.id ?? null;
  const [registration, setRegistration] = useState<Registration | null>(null);
  const current =
    registration?.pathname === pathname &&
    registration.context.workspaceId === workspaceId
      ? registration
      : null;
  const page = pathname === "/" ? "collections" : pathname.slice(1);
  const context: PageContext | null =
    current?.context ??
    (pathname.startsWith("/items/") ? null : { page, workspaceId });
  const latest = useRef({ context, current });
  useLayoutEffect(() => {
    latest.current = { context, current };
  });
  const publish = useCallback((value: Registration) => {
    setRegistration(value);
    return () =>
      setRegistration((previous) => (previous === value ? null : previous));
  }, []);
  async function apply(proposal: FilterProposal) {
    const snapshot = latest.current;
    if (!canApplyProposal(snapshot.context, proposal) || !snapshot.current)
      throw new Error(
        "Откройте исходную коллекцию и закройте редактор записи.",
      );
    const result = await apiRequest<{ filter: object }>(
      "/api/assistant/filter/validate",
      "POST",
      {
        context: snapshot.context,
        collectionId: proposal.collectionId,
        filter: proposal.filter,
      },
    );
    if (
      latest.current.current !== snapshot.current ||
      !canApplyProposal(latest.current.context, proposal)
    ) {
      throw new Error(
        "Страница изменилась. Проверьте предложение и нажмите ещё раз.",
      );
    }
    snapshot.current.apply(JSON.stringify(result.filter));
  }
  function collectionDisplayName(name: string): string | undefined {
    const collection = collections.find((entry) => entry.name === name);
    return collection ? collection.displayName || collection.name : undefined;
  }
  return (
    <Context.Provider
      value={{
        context,
        collectionDisplayName,
        publish,
        apply,
        workspaceName: workspace?.active?.name ?? null,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export function useAssistantContext() {
  return useContext(Context);
}

export function useAssistantTableContext(
  context: PageContext | null,
  onApply: (filter: string) => void,
) {
  const publish = useAssistantContext()?.publish;
  const pathname = usePathname();
  const serialized = JSON.stringify(context);
  const apply = useRef(onApply);
  useLayoutEffect(() => {
    apply.current = onApply;
  });
  useEffect(() => {
    const snapshot = JSON.parse(serialized) as PageContext | null;
    if (!publish || !snapshot) return;
    return publish({
      pathname,
      context: snapshot,
      apply: (filter) => apply.current(filter),
    });
  }, [publish, pathname, serialized]);
}

export function AssistantTableContext({
  context,
  onApply,
}: {
  context: PageContext | null;
  onApply: (filter: string) => void;
}) {
  useAssistantTableContext(context, onApply);
  return null;
}
