import { randomUUID } from "node:crypto";
import type { GoogleWriteInput } from "@asmblyr-collaborative/kit";
import { GoogleClient, fileId } from "./client.js";

export async function executeGoogleWrite(
  client: GoogleClient,
  input: GoogleWriteInput,
): Promise<object> {
  const drive = `drive/v3/files/${input.fileId ? fileId(input.fileId) : ""}`;
  if (input.operation === "rename_file" || input.operation === "trash_file") {
    return client.json(
      `${drive}?supportsAllDrives=true&fields=id,name,trashed`,
      {
        method: "PATCH",
        body: JSON.stringify(
          input.operation === "rename_file"
            ? { name: input.title }
            : { trashed: true },
        ),
      },
    );
  }
  if (input.operation === "create_sheet") {
    return client.json(
      "sheets/v4/spreadsheets?fields=spreadsheetId,spreadsheetUrl",
      {
        method: "POST",
        body: JSON.stringify({ properties: { title: input.title } }),
      },
    );
  }
  if (
    input.operation === "update_cells" ||
    input.operation === "append_cells"
  ) {
    const range = encodeURIComponent(input.range!);
    const append = input.operation === "append_cells";
    return client.json(
      `sheets/v4/spreadsheets/${fileId(input.fileId!)}/values/${range}${append ? ":append" : ""}?valueInputOption=RAW${append ? "&insertDataOption=INSERT_ROWS" : ""}`,
      {
        method: append ? "POST" : "PUT",
        body: JSON.stringify({
          range: input.range,
          majorDimension: "ROWS",
          values: input.values,
        }),
      },
    );
  }
  if (input.operation === "update_text") {
    return client.json(
      `upload/${drive}?uploadType=media&supportsAllDrives=true&fields=id,name`,
      {
        method: "PATCH",
        headers: { "content-type": "text/plain; charset=utf-8" },
        body: input.content!,
      },
    );
  }
  const boundary = `asmblyr_${randomUUID().replaceAll("-", "")}`;
  const body = `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${JSON.stringify({ name: input.title, mimeType: "text/plain" })}\r\n--${boundary}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${input.content}\r\n--${boundary}--\r\n`;
  return client.json(
    "upload/drive/v3/files?uploadType=multipart&fields=id,name",
    {
      method: "POST",
      headers: { "content-type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
}
