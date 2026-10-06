import type {
  GoogleCells,
  GoogleFile,
  GoogleFileList,
  GoogleSheet,
  GoogleText,
} from "@asmblyr-collaborative/kit";
import { integrationError } from "../../integrations/types.js";
import type { GoogleConnections } from "./connections.js";

function requestUrl(path: string): string {
  if (path.startsWith("sheets/v4/")) {
    return `https://sheets.googleapis.com/${path.slice("sheets/".length)}`;
  }
  if (path.startsWith("drive/v3/") || path.startsWith("upload/drive/v3/")) {
    return `https://www.googleapis.com/${path}`;
  }
  throw integrationError("connection_input_invalid");
}

function responseError(status: number) {
  switch (status) {
    case 400:
      return integrationError("connection_google_input_invalid", 400);
    case 401:
      return integrationError("connection_reconnect_required", 409);
    case 403:
      return integrationError("connection_google_access_denied", 403);
    case 404:
      return integrationError("connection_google_not_found", 404);
    case 429:
      return integrationError("connection_google_rate_limited", 429);
    default:
      return integrationError("connection_google_request_failed", 502);
  }
}

export function fileId(value: string): string {
  if (!/^[A-Za-z0-9_-]{1,256}$/.test(value)) {
    throw integrationError("connection_input_invalid");
  }
  return value;
}
export function cellRange(value: string): string {
  if (value.length > 200) {
    throw integrationError("connection_input_invalid");
  }
  const match =
    /^(?:('[^']*(?:''[^']*)*'|[^'!]+)!)?([A-Z]{1,3})([1-9][0-9]{0,6})(?::([A-Z]{1,3})([1-9][0-9]{0,6}))?$/.exec(
      value,
    );
  if (!match) {
    throw integrationError("connection_range_required");
  }
  const column = (name: string) =>
    [...name].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
  const rows = Number(match[5] ?? match[3]) - Number(match[3]) + 1;
  const columns = column(match[4] ?? match[2]!) - column(match[2]!) + 1;
  if (
    rows < 1 ||
    columns < 1 ||
    rows * columns > 500 ||
    /[\u0000-\u001f]/.test(value)
  ) {
    throw integrationError("connection_range_too_large");
  }
  return value;
}
async function boundedText(
  response: Response,
  limit: number,
  truncate: boolean,
) {
  if (!response.body) {
    return { text: "", truncated: false };
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  let clipped = false;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (size + value.length > limit) {
        if (!truncate) {
          throw integrationError("connection_result_too_large", 422);
        }
        chunks.push(value.slice(0, limit - size));
        clipped = true;
        break;
      }
      chunks.push(value);
      size += value.length;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
  return { text: Buffer.concat(chunks).toString("utf8"), truncated: clipped };
}

export class GoogleClient {
  constructor(
    readonly connections: GoogleConnections,
    readonly owner: string,
    readonly signal?: AbortSignal,
    readonly expectedConnectionId?: string,
  ) {}
  async request(path: string, init: RequestInit = {}) {
    const url = requestUrl(path);
    this.signal?.throwIfAborted();
    const { token, connectionId } = await this.connections.accessToken(
      this.owner,
    );
    if (
      this.expectedConnectionId &&
      connectionId !== this.expectedConnectionId
    ) {
      throw integrationError("connection_proposal_unavailable", 409);
    }
    let response: Response;
    try {
      response = await this.connections.transport(url, {
        ...init,
        headers: {
          authorization: `Bearer ${token}`,
          ...(init.body ? { "content-type": "application/json" } : {}),
          ...init.headers,
        },
        redirect: "error",
        signal: AbortSignal.any([
          AbortSignal.timeout(8000),
          ...(this.signal ? [this.signal] : []),
        ]),
      });
    } catch {
      throw integrationError("connection_provider_unavailable", 503);
    }
    if (!response.ok) {
      await response.body?.cancel();
      if (response.status === 401) {
        await this.connections.settings
          .database("asmblyr_connections")
          .where({ id: connectionId, owner_id: this.owner })
          .update({ status: "reconnect" });
      }
      throw responseError(response.status);
    }
    return response;
  }
  async json<T>(path: string, init: RequestInit = {}): Promise<T> {
    const result = await boundedText(
      await this.request(path, init),
      36000,
      false,
    );
    try {
      return JSON.parse(result.text) as T;
    } catch {
      throw integrationError("connection_google_response_invalid", 502);
    }
  }
  async metadata(id: string): Promise<GoogleFile & { version: string }> {
    const row = await this.json<{
      id: string;
      name: string;
      mimeType: string;
      version?: string;
    }>(
      `drive/v3/files/${fileId(id)}?supportsAllDrives=true&fields=id,name,mimeType,version`,
    );
    return {
      id: row.id,
      name: row.name,
      mimeType: row.mimeType,
      url: `https://drive.google.com/file/d/${fileId(row.id)}/view`,
      version: row.version ?? "",
    };
  }
  async list(input: {
    query: string;
    pageToken: string | null;
  }): Promise<GoogleFileList> {
    if (input.query.length > 300 || (input.pageToken?.length ?? 0) > 2048) {
      throw integrationError("connection_input_invalid");
    }
    const escaped = input.query.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
    const query = new URLSearchParams({
      q: `trashed = false${input.query ? ` and (name contains '${escaped}')` : ""}`,
      pageSize: "25",
      fields: "files(id,name,mimeType),nextPageToken",
      supportsAllDrives: "true",
      includeItemsFromAllDrives: "true",
    });
    if (input.pageToken) {
      query.set("pageToken", input.pageToken);
    }
    const result = await this.json<{
      files: { id: string; name: string; mimeType: string }[];
      nextPageToken?: string;
    }>(`drive/v3/files?${query}`);
    return {
      files: result.files.map((row) => ({
        ...row,
        url: `https://drive.google.com/file/d/${fileId(row.id)}/view`,
      })),
      nextPageToken: result.nextPageToken ?? null,
    };
  }
  async readText(id: string): Promise<GoogleText> {
    const metadata = await this.metadata(id);
    const file: GoogleFile = {
      id: metadata.id,
      name: metadata.name,
      mimeType: metadata.mimeType,
      url: metadata.url,
    };
    let path: string;
    if (file.mimeType === "application/vnd.google-apps.document") {
      path = `drive/v3/files/${fileId(id)}/export?mimeType=text%2Fplain`;
    } else if (
      /^text\//.test(file.mimeType) ||
      ["application/json", "application/xml"].includes(file.mimeType)
    ) {
      path = `drive/v3/files/${fileId(id)}?alt=media&supportsAllDrives=true`;
    } else {
      throw integrationError("connection_use_sheet_or_text_file", 422);
    }
    const result = await boundedText(await this.request(path), 30000, true);
    return { file, content: result.text, truncated: result.truncated };
  }
  async sheet(id: string): Promise<GoogleSheet> {
    const result = await this.json<{
      spreadsheetId: string;
      properties: { title: string };
      sheets: {
        properties: {
          title: string;
          gridProperties: { rowCount: number; columnCount: number };
        };
      }[];
    }>(
      `sheets/v4/spreadsheets/${fileId(id)}?fields=spreadsheetId,properties(title),sheets(properties(title,gridProperties))`,
    );
    return {
      id: result.spreadsheetId,
      title: result.properties.title,
      url: `https://docs.google.com/spreadsheets/d/${fileId(id)}/edit`,
      sheets: result.sheets.map((sheet) => ({
        title: sheet.properties.title,
        rows: sheet.properties.gridProperties.rowCount,
        columns: sheet.properties.gridProperties.columnCount,
      })),
    };
  }
  async cells(input: { fileId: string; range: string }): Promise<GoogleCells> {
    const result = await this.json<{
      range: string;
      values?: (string | number | boolean)[][];
    }>(
      `sheets/v4/spreadsheets/${fileId(input.fileId)}/values/${encodeURIComponent(cellRange(input.range))}?valueRenderOption=FORMATTED_VALUE`,
    );
    return {
      spreadsheetId: input.fileId,
      range: result.range,
      values: result.values ?? [],
    };
  }
}
