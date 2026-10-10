import type { ExtensionHistoryEntry } from "@asmblyr-collaborative/contracts";
import { useUiCopy } from "@/lib/ui-copy";

export function ExtensionHistory({
  history,
  error,
  loading,
}: {
  history: ExtensionHistoryEntry[];
  error: string;
  loading: boolean;
}) {
  const copy = useUiCopy();
  return (
    <section className="space-y-3 border-t pt-5">
      <h3 className="text-sm font-medium">{copy("История операций")}</h3>
      {loading && (
        <p
          role="status"
          className="text-sm text-muted-foreground"
        >
          {copy("Загрузка истории…")}
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {!loading && history.length ? (
        <ul className="space-y-2 text-sm">
          {history.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap justify-between gap-2"
            >
              <span>
                {item.action} · {item.result}
                {item.error_message && (
                  <span className="mt-1 block text-destructive">
                    {item.error_message}
                  </span>
                )}
              </span>
              <time dateTime={item.created_at}>
                {new Date(item.created_at).toLocaleString()}
              </time>
            </li>
          ))}
        </ul>
      ) : (
        !loading &&
        !error && (
          <p className="text-sm text-muted-foreground">
            {copy("Операций пока нет.")}
          </p>
        )
      )}
    </section>
  );
}
