import type { ConnectionWriteResult } from "@asmblyr-collaborative/contracts";
import type { GoogleWriteInput } from "@asmblyr-collaborative/kit";

function validId(value: unknown): string | null {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,256}$/.test(value)
    ? value
    : null;
}

export function googleWriteUrl(
  input: GoogleWriteInput,
  result: object = {},
): string | null {
  const data = result as Record<string, unknown>;
  const sheet = ["create_sheet", "update_cells", "append_cells"].includes(
    input.operation,
  );
  const id = validId(input.fileId ?? (sheet ? data.spreadsheetId : data.id));
  if (!id) {
    return null;
  }
  return sheet
    ? `https://docs.google.com/spreadsheets/d/${id}/edit`
    : `https://drive.google.com/file/d/${id}/view`;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

/** Keep only operation receipts, not arbitrary provider content or URLs. */
export function googleWriteResult(
  input: GoogleWriteInput,
  value: object,
): ConnectionWriteResult {
  const data = value as Record<string, unknown>;
  const update =
    data.updates && typeof data.updates === "object"
      ? (data.updates as Record<string, unknown>)
      : data;
  const range = update.updatedRange;
  return {
    url: googleWriteUrl(input, value),
    updatedCells: count(update.updatedCells),
    updatedRows: count(update.updatedRows),
    range: typeof range === "string" && range.length <= 200 ? range : null,
  };
}
