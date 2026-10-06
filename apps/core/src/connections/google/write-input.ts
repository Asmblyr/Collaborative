import type { GoogleWriteInput } from "@asmblyr-collaborative/kit";
import { z } from "@asmblyr-collaborative/kit/actions";
import { fileId, cellRange } from "./client.js";
import { integrationError } from "../../integrations/types.js";

const schema = z.strictObject({
  operation: z.enum([
    "create_text",
    "update_text",
    "rename_file",
    "trash_file",
    "create_sheet",
    "update_cells",
    "append_cells",
  ]),
  fileId: z.string().max(256).nullable(),
  title: z.string().trim().min(1).max(200).nullable(),
  range: z.string().max(200).nullable(),
  content: z.string().max(16000).nullable(),
  values: z
    .array(
      z
        .array(
          z.union([z.string().max(1000), z.number().finite(), z.boolean()]),
        )
        .min(1)
        .max(100),
    )
    .min(1)
    .max(100)
    .nullable(),
});
export function writeInput(value: unknown): GoogleWriteInput {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw integrationError("connection_input_invalid");
  }
  const input = parsed.data;
  const creating =
    input.operation === "create_text" || input.operation === "create_sheet";
  const cells =
    input.operation === "update_cells" || input.operation === "append_cells";
  const title = creating || input.operation === "rename_file";
  const content =
    input.operation === "create_text" || input.operation === "update_text";
  if (
    (!creating && !input.fileId) ||
    (creating && input.fileId !== null) ||
    (title ? !input.title : input.title !== null) ||
    (content ? input.content === null : input.content !== null) ||
    (cells
      ? !input.range || !input.values
      : input.range !== null || input.values !== null)
  ) {
    throw integrationError("connection_input_invalid");
  }
  if (input.fileId) {
    fileId(input.fileId);
  }
  if (input.range) {
    cellRange(input.range);
  }
  if (input.values) {
    const count = input.values.reduce((n, row) => n + row.length, 0);
    if (
      count > 500 ||
      JSON.stringify(input.values).length > 16000 ||
      input.values.some((row) => row.length !== input.values![0]!.length)
    ) {
      throw integrationError("connection_input_invalid");
    }
    // Require an exact destination rectangle: a model cannot expand a previewed range.
    const range = input.range!.split("!").at(-1)!;
    const coordinates = /([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(range)!;
    const column = (name: string) =>
      [...name].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0);
    const rows =
      Number(coordinates[4] ?? coordinates[2]) - Number(coordinates[2]) + 1;
    const columns =
      column(coordinates[3] ?? coordinates[1]!) - column(coordinates[1]!) + 1;
    if (input.values.length !== rows || input.values[0]!.length !== columns) {
      throw integrationError("connection_range_mismatch");
    }
  }
  return input;
}
