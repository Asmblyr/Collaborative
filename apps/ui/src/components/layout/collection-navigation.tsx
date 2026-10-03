"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ChevronRight, Folder, Table2 } from "lucide-react";
import { Collapsible } from "radix-ui";
import { isCollectionPath } from "@/lib/item-location";
import { collectionTree, flattenCollections, type CollectionNode, type NavigableCollection } from "@/lib/collection-tree";
import type { CollectionFolder } from "@/components/items/types";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { SidebarMenu, SidebarMenuAction, SidebarMenuButton, SidebarMenuItem, SidebarMenuSub,
  SidebarMenuSubButton, SidebarMenuSubItem, useSidebar } from "@/components/ui/sidebar";

interface NavigationProps { pathname: string; onNavigate: () => void }

function NavigationDropdown({ name, nodes, folder, pathname, onNavigate }: NavigationProps & {
  name: string; nodes: CollectionNode[]; folder?: boolean;
}) {
  const navigating = useRef(false);
  const entries = flattenCollections(nodes);
  const active = entries.some(({ collection }) => isCollectionPath(pathname, collection.name));
  const Icon = folder ? Folder : Table2;
  return <SidebarMenuItem><DropdownMenu>
    <DropdownMenuTrigger asChild>
      <SidebarMenuButton tooltip={name} isActive={active} aria-label={`Открыть группу ${name}`}><Icon aria-hidden="true" /></SidebarMenuButton>
    </DropdownMenuTrigger>
    <DropdownMenuContent side="right" align="start" sideOffset={8} className="max-h-[70dvh] w-64 overflow-y-auto"
      onCloseAutoFocus={(event) => { if (navigating.current) { event.preventDefault(); navigating.current = false; } }}>
      <div className="flex items-center gap-2 px-2 py-2 text-sm font-medium"><Icon className="size-4 shrink-0" /><span className="truncate">{name}</span></div>
      <DropdownMenuSeparator />
      {entries.map(({ collection, depth }) => {
        const selected = isCollectionPath(pathname, collection.name);
        return <DropdownMenuItem key={collection.name} asChild onSelect={() => { navigating.current = true; }}
          className={selected ? "bg-accent text-accent-foreground" : undefined}>
          <Link href={`/items/${encodeURIComponent(collection.name)}`} onClick={onNavigate}
            style={{ paddingLeft: 8 + Math.min(depth, 6) * 12 }} aria-current={selected ? "page" : undefined}>
            <Table2 /><span className="truncate">{collection.displayName || collection.name}</span>
          </Link>
        </DropdownMenuItem>;
      })}
    </DropdownMenuContent>
  </DropdownMenu></SidebarMenuItem>;
}

function CollectionNavItem({ node, nested = false, pathname, onNavigate }: NavigationProps & { node: CollectionNode; nested?: boolean }) {
  const { isMobile, state } = useSidebar();
  const [open, setOpen] = useState(true);
  const { collection, children } = node;
  const name = collection.displayName || collection.name;
  const active = isCollectionPath(pathname, collection.name);
  if (!nested && !isMobile && state === "collapsed" && children.length > 0) {
    return <NavigationDropdown name={name} nodes={[node]} pathname={pathname} onNavigate={onNavigate} />;
  }
  const Item = nested ? SidebarMenuSubItem : SidebarMenuItem;
  const link = <Link href={`/items/${encodeURIComponent(collection.name)}`} onClick={onNavigate} aria-current={active ? "page" : undefined}>
    <Table2 aria-hidden="true" /><span>{name}</span>
  </Link>;
  return <Collapsible.Root asChild open={open} onOpenChange={setOpen}><Item>
    {nested ? <SidebarMenuSubButton asChild isActive={active} className={children.length ? "pr-7" : undefined}>{link}</SidebarMenuSubButton>
      : <SidebarMenuButton asChild isActive={active} tooltip={name} className={children.length ? "pr-7" : undefined}>{link}</SidebarMenuButton>}
    {children.length > 0 && <>
      <Collapsible.Trigger asChild><SidebarMenuAction aria-label={`Вложенные коллекции ${name}`}>
        <ChevronRight className={open ? "rotate-90 transition-transform" : "transition-transform"} />
      </SidebarMenuAction></Collapsible.Trigger>
      <Collapsible.Content><SidebarMenuSub className="mr-0 ml-3 px-1">
        {children.map((child) => <CollectionNavItem key={child.collection.name} node={child} nested pathname={pathname} onNavigate={onNavigate} />)}
      </SidebarMenuSub></Collapsible.Content>
    </>}
  </Item></Collapsible.Root>;
}

function FolderNavItem({ name, nodes, pathname, onNavigate }: NavigationProps & { name: string; nodes: CollectionNode[] }) {
  const { isMobile, state } = useSidebar();
  const [open, setOpen] = useState(true);
  if (!isMobile && state === "collapsed") return <NavigationDropdown folder name={name} nodes={nodes} pathname={pathname} onNavigate={onNavigate} />;
  return <Collapsible.Root asChild open={open} onOpenChange={setOpen}><SidebarMenuItem>
    <Collapsible.Trigger asChild><SidebarMenuButton tooltip={name}>
      <Folder aria-hidden="true" /><span>{name}</span>
      <span className="ml-auto text-xs tabular-nums text-muted-foreground">{flattenCollections(nodes).length}</span>
      <ChevronRight className={`size-3.5 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`} />
    </SidebarMenuButton></Collapsible.Trigger>
    <Collapsible.Content><SidebarMenuSub className="mr-0 ml-3 px-1">
      {nodes.map((node) => <CollectionNavItem key={node.collection.name} node={node} nested pathname={pathname} onNavigate={onNavigate} />)}
    </SidebarMenuSub></Collapsible.Content>
  </SidebarMenuItem></Collapsible.Root>;
}

export function CollectionNavigation({ collections, folders, pathname, onNavigate }: NavigationProps & {
  collections: NavigableCollection[]; folders: CollectionFolder[];
}) {
  const tree = collectionTree(collections);
  return <SidebarMenu>
    {folders.map((folder) => {
      const nodes = tree.filter(({ collection }) => collection.folderId === folder.id);
      return nodes.length ? <FolderNavItem key={folder.id} name={folder.name} nodes={nodes} pathname={pathname} onNavigate={onNavigate} /> : null;
    })}
    {tree.filter(({ collection }) => !collection.folderId || !folders.some((folder) => folder.id === collection.folderId))
      .map((node) => <CollectionNavItem key={node.collection.name} node={node} pathname={pathname} onNavigate={onNavigate} />)}
  </SidebarMenu>;
}
