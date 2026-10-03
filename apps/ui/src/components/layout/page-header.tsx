import type { ReactNode } from "react";

export function PageHeader({ title, description, children }: {
  title: string; description?: ReactNode; children?: ReactNode;
}) {
  return <header className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
    <h1 className="sr-only">{title}</h1>
    {description && <div className="min-w-0 text-sm text-muted-foreground">{description}</div>}
    {children && <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>}
  </header>;
}
