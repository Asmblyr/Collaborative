"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useWorkspace } from "./workspace-provider";

/** Sidebar and page links carry the current workspace, including new-tab clicks. */
export function WorkspaceLink({
  href,
  ...props
}: Omit<ComponentProps<typeof Link>, "href"> & { href: string }) {
  const workspace = useWorkspace();
  return (
    <Link
      {...props}
      href={workspace?.href(href) ?? href}
    />
  );
}
