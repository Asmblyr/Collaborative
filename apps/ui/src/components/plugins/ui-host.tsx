"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@asmblyr-collaborative/kit/ui/button";
import { useUiCopy } from "@/lib/ui-copy";

function PluginError({ onRetry }: { onRetry(): void }) {
  const copy = useUiCopy();
  return (
    <div
      role="alert"
      className="space-y-3 rounded-xl border p-5"
    >
      <p className="text-sm text-destructive">
        {copy("Не удалось открыть расширение.")}
      </p>
      <Button
        variant="outline"
        onClick={onRetry}
      >
        {copy("Попробовать снова")}
      </Button>
    </div>
  );
}

class PluginBoundary extends Component<
  { children: ReactNode; fallback?: ReactNode; onFailure?(): void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onFailure?.();
  }

  render() {
    if (this.state.failed) {
      if (this.props.fallback !== undefined) {
        return this.props.fallback;
      }
      return <PluginError onRetry={() => this.setState({ failed: false })} />;
    }
    return this.props.children;
  }
}

/** Shared rendering boundary for pages and record panels. */
export function PluginUiHost({
  children,
  onFailure,
  fallback,
}: {
  children: ReactNode;
  fallback?: ReactNode;
  onFailure?(): void;
}) {
  return (
    <PluginBoundary
      onFailure={onFailure}
      fallback={fallback}
    >
      {children}
    </PluginBoundary>
  );
}
