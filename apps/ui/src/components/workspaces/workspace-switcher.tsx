"use client";

import { useState } from "react";
import {
  Check,
  ChevronsUpDown,
  Layers3,
  LayoutGrid,
  Plus,
  Settings2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import type { Workspace } from "@/lib/workspaces";
import { useWorkspace } from "./workspace-provider";
import { WorkspaceEditor } from "./workspace-editor";
import { useUiCopy } from "@/lib/ui-copy";

export function WorkspaceSwitcher({
  collections,
  superuser,
}: {
  collections: { name: string; displayName?: string | null }[];
  superuser: boolean;
}) {
  const copy = useUiCopy();

  const state = useWorkspace(),
    { isMobile } = useSidebar();
  const [editor, setEditor] = useState<{ workspace: Workspace | null } | null>(
    null,
  );
  if (!state) return null;
  return (
    <>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <SidebarMenuButton
                size="lg"
                aria-label={copy("Переключить workspace")}
                disabled={state.pending}
                className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
              >
                <span className="flex aspect-square size-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
                  <Layers3 className="size-4" />
                </span>
                <span className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">
                    {state.active?.name || copy("Все коллекции")}
                  </span>
                  <span className="truncate text-xs text-muted-foreground">
                    Asmblyr
                  </span>
                </span>
                <ChevronsUpDown className="ml-auto" />
              </SidebarMenuButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={isMobile ? "bottom" : "right"}
              align="start"
              sideOffset={4}
              className="w-(--radix-dropdown-menu-trigger-width) min-w-64 rounded-lg"
            >
              <DropdownMenuLabel className="text-xs text-muted-foreground">
                {copy("Рабочие пространства ")}
              </DropdownMenuLabel>
              <DropdownMenuItem
                className="gap-2 p-2"
                onSelect={() => void state.select(null)}
              >
                <span className="flex size-6 items-center justify-center rounded-sm border">
                  <Layers3 className="size-4" />
                </span>
                {copy("Все коллекции")}
                {!state.active && <Check className="ml-auto" />}
              </DropdownMenuItem>
              <div className="max-h-72 overflow-auto">
                {state.workspaces.map((workspace) => (
                  <DropdownMenuItem
                    key={workspace.id}
                    onSelect={() => void state.select(workspace.id)}
                  >
                    <span className="flex size-6 shrink-0 items-center justify-center rounded-sm border">
                      <LayoutGrid className="size-4" />
                    </span>
                    <span className="truncate">{workspace.name}</span>
                    {state.active?.id === workspace.id && (
                      <Check className="ml-auto" />
                    )}
                  </DropdownMenuItem>
                ))}
              </div>
              {superuser && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => setEditor({ workspace: null })}
                  >
                    <Plus />
                    {copy("Новый workspace ")}
                  </DropdownMenuItem>
                  {state.active && (
                    <DropdownMenuItem
                      onSelect={() => setEditor({ workspace: state.active })}
                    >
                      <Settings2 />
                      {copy("Настроить workspace ")}
                    </DropdownMenuItem>
                  )}
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
      {state.error && (
        <p
          role="alert"
          className="px-2 text-xs text-destructive group-data-[collapsible=icon]:sr-only"
        >
          {state.error}
        </p>
      )}
      {editor && (
        <WorkspaceEditor
          key={editor.workspace?.id || "new"}
          workspace={editor.workspace}
          collections={collections}
          onClose={() => setEditor(null)}
          onChanged={state.reload}
        />
      )}
    </>
  );
}
