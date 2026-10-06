import {
  AccessGate,
  defineHandler,
  defineModelAnnotation,
  defineModelContext,
} from "@asmblyr-collaborative/kit";
import type { ConnectionWriteProposal } from "@asmblyr-collaborative/contracts";
import type { GoogleWriteInput } from "@asmblyr-collaborative/kit";
import { google } from "../../connection.ts";

export default defineModelContext<GoogleWriteInput>(
  defineHandler(async (event): Promise<ConnectionWriteProposal> => {
    const input = (await event.req.json()) as GoogleWriteInput;
    return google(event).proposeWrite(input);
  }),
  defineModelAnnotation({
    title: "Предложить изменение Google Workspace",
    description:
      "Prepare a Google Drive or Sheets write ONLY for an explicit human request. Does not write to Google. A verified preview and confirmation button are displayed automatically. Never claim execution or retry uncertain writes. Null unused fields. Supports create_text, update_text (text files only), rename_file, trash_file (move to trash), create_sheet, update_cells, append_cells. Sheet values are RAW, not formulas, max 500 cells; range rectangle must match values dimensions. append_cells appends after the logical table in the specified range and inserts rows; explain this.",
    middleware: AccessGate.authenticated,
    connection: "google",
    readOnly: true,
  }),
);
