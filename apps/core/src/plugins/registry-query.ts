import { EndpointError } from "@asmblyr-collaborative/kit";
import type { ExtensionEntry } from "@asmblyr-collaborative/contracts";

export interface ExtensionListQuery {
  page: number;
  limit: number;
  search: string;
  status: ExtensionEntry["status"] | "";
  category: string;
  sort: "title" | "version" | "status";
}

export function parseExtensionListQuery(value: unknown): ExtensionListQuery {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      page: 1,
      limit: 20,
      search: "",
      status: "",
      category: "",
      sort: "title",
    };
  }
  const query = value as Record<string, unknown>;
  if (
    Object.keys(query).some(
      (key) =>
        !["page", "limit", "search", "status", "category", "sort"].includes(
          key,
        ),
    )
  ) {
    throw new EndpointError(
      400,
      "EXTENSION_QUERY_INVALID",
      "Неизвестный параметр поиска",
    );
  }
  for (const key of ["page", "limit"]) {
    if (
      query[key] !== undefined &&
      (typeof query[key] !== "string" || !/^\d+$/.test(query[key]))
    ) {
      throw new EndpointError(
        400,
        "EXTENSION_QUERY_INVALID",
        `Некорректное значение ${key}`,
      );
    }
  }
  const page = query.page === undefined ? 1 : Number(query.page);
  const limit = query.limit === undefined ? 20 : Number(query.limit);
  if (
    !Number.isSafeInteger(page) ||
    page < 1 ||
    !Number.isSafeInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw new EndpointError(
      400,
      "EXTENSION_QUERY_INVALID",
      "Некорректная пагинация",
    );
  }
  for (const key of ["search", "status", "category", "sort"]) {
    if (
      query[key] !== undefined &&
      (typeof query[key] !== "string" || query[key].length > 120)
    ) {
      throw new EndpointError(
        400,
        "EXTENSION_QUERY_INVALID",
        `Некорректное значение ${key}`,
      );
    }
  }
  const status = query.status ?? "";
  if (
    status &&
    ![
      "healthy",
      "disabled",
      "restart_required",
      "incompatible",
      "failed",
    ].includes(status as string)
  ) {
    throw new EndpointError(
      400,
      "EXTENSION_QUERY_INVALID",
      "Некорректный статус",
    );
  }
  const sort = query.sort ?? "title";
  if (!["title", "version", "status"].includes(sort as string)) {
    throw new EndpointError(
      400,
      "EXTENSION_QUERY_INVALID",
      "Некорректная сортировка",
    );
  }
  return {
    page,
    limit,
    search: (query.search as string | undefined) ?? "",
    status: status as ExtensionListQuery["status"],
    category: (query.category as string | undefined) ?? "",
    sort: sort as ExtensionListQuery["sort"],
  };
}
