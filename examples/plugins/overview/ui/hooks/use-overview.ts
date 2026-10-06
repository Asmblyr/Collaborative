"use client";

import { useEffect, useState } from "react";
import type { PluginRequest } from "@asmblyr-collaborative/kit/ui";
import type { Overview } from "../../shared/overview.ts";

export function useOverview(request: PluginRequest) {
  const [data, setData] = useState<Overview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    request<Overview>("/session", { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        setError("");
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        setError(
          cause instanceof Error ? cause.message : "Не удалось загрузить обзор",
        );
        setLoading(false);
      });
    return () => controller.abort();
  }, [request, revision]);

  function reload() {
    setLoading(true);
    setError("");
    setRevision((current) => current + 1);
  }

  return { data, loading, error, reload };
}
