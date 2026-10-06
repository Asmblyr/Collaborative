import { redirect } from "next/navigation";
import { FilesWorkspace } from "@/components/files/files-workspace";
import type { FilePage } from "@/components/files/types";
import { coreAddress, requireSession } from "@/lib/session";
import { loadSettingsAccess } from "@/lib/settings-access";
import { getUiCopy } from "@/lib/ui-copy-server";

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const copy = await getUiCopy();

  const { user, token } = await requireSession("/files");
  if (
    !user.superuser &&
    !(await loadSettingsAccess(token)).sections.includes("files")
  )
    redirect("/");
  const params = await searchParams;
  const query = typeof params.q === "string" ? params.q.slice(0, 200) : "";
  const page =
    typeof params.page === "string" && /^[1-9]\d{0,4}$/.test(params.page)
      ? params.page
      : "1";
  const limit =
    typeof params.limit === "string" &&
    ["10", "25", "50", "100"].includes(params.limit)
      ? params.limit
      : "25";
  let result: FilePage;
  try {
    const response = await fetch(
      coreAddress(
        `/files?${new URLSearchParams({ page, limit, search: query })}`,
      ),
      {
        cache: "no-store",
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok) throw new Error("Files unavailable");
    result = (await response.json()) as FilePage;
  } catch {
    return (
      <p
        role="alert"
        className="text-sm text-destructive"
      >
        {copy("Не удалось загрузить файлы. Обновите страницу. ")}
      </p>
    );
  }
  return (
    <FilesWorkspace
      result={result}
      query={query}
    />
  );
}
