export const MAX_FILE_BYTES = 25 * 1024 * 1024;

export function fileError(
  message: string,
  statusCode = 400,
): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

export function parseFileId(id: string): string {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  ) {
    throw fileError("Некорректный идентификатор файла");
  }
  return id;
}

export function uploadHeaders(
  headers: Record<string, string | string[] | undefined>,
) {
  let filename: string;
  try {
    filename = decodeURIComponent(String(headers["x-file-name"] ?? ""));
  } catch {
    throw fileError("Некорректное имя файла");
  }
  if (
    !filename.trim() ||
    filename.length > 255 ||
    /[\x00-\x1f\x7f/\\]/.test(filename) ||
    filename === "." ||
    filename === ".."
  ) {
    throw fileError("Укажите имя файла без пути, длиной до 255 символов");
  }
  const mimeType = headers["x-file-type"] ?? "application/octet-stream";
  if (
    typeof mimeType !== "string" ||
    mimeType.length > 255 ||
    !/^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(mimeType)
  ) {
    throw fileError("Некорректный тип файла");
  }
  return { filename, mimeType: mimeType.toLowerCase() };
}

/** Only raster signatures qualify for same-origin inline preview, never client MIME alone. */
export function rasterType(content: Buffer): string | null {
  if (
    content.length >= 24 &&
    content
      .subarray(0, 8)
      .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    content.toString("ascii", 12, 16) === "IHDR"
  )
    return "image/png";
  if (
    content.length >= 4 &&
    content[0] === 255 &&
    content[1] === 216 &&
    content[2] === 255
  )
    return "image/jpeg";
  if (
    content.length >= 10 &&
    ["GIF87a", "GIF89a"].includes(content.toString("ascii", 0, 6))
  )
    return "image/gif";
  if (
    content.length >= 16 &&
    content.toString("ascii", 0, 4) === "RIFF" &&
    content.toString("ascii", 8, 12) === "WEBP"
  )
    return "image/webp";
  return null;
}

export function parseFilePatch(body: unknown): {
  title?: string;
  description?: string;
} {
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw fileError("Ожидаются настройки файла");
  const values = body as Record<string, unknown>;
  if (
    !Object.keys(values).length ||
    Object.keys(values).some((k) => !["title", "description"].includes(k))
  ) {
    throw fileError("Можно изменить только название и описание файла");
  }
  const result: { title?: string; description?: string } = {};
  for (const key of ["title", "description"] as const) {
    if (values[key] === undefined) continue;
    if (typeof values[key] !== "string")
      throw fileError("Название и описание должны быть текстом");
    const value = values[key].trim();
    if (
      value.length > (key === "title" ? 255 : 4000) ||
      (key === "title" && !value)
    ) {
      throw fileError("Проверьте длину названия и описания");
    }
    result[key] = value;
  }
  return result;
}

export function parseFileList(query: unknown) {
  const q = query as Record<string, unknown>;
  if (Object.keys(q).some((k) => !["search", "page", "limit"].includes(k)))
    throw fileError("Неизвестные параметры списка");
  const page = Number(q.page ?? 1),
    limit = Number(q.limit ?? 25);
  if (
    !Number.isInteger(page) ||
    page < 1 ||
    page > 100000 ||
    !Number.isInteger(limit) ||
    limit < 1 ||
    limit > 100
  ) {
    throw fileError("Некорректная страница или размер страницы");
  }
  if (
    q.search !== undefined &&
    (typeof q.search !== "string" || q.search.length > 200)
  )
    throw fileError("Некорректный поиск");
  return { page, limit, search: String(q.search ?? "").trim() };
}
