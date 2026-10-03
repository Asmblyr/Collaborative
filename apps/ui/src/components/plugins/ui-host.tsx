"use client";

import { Component, type ReactNode } from "react";
import { Button } from "@asmblyr/kit/ui/button";

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
      return (
        <div
          role="alert"
          className="space-y-3 rounded-xl border p-5"
        >
          <p className="text-sm text-destructive">
            Не удалось открыть расширение.
          </p>
          <Button
            variant="outline"
            onClick={() => this.setState({ failed: false })}
          >
            Попробовать снова
          </Button>
        </div>
      );
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
