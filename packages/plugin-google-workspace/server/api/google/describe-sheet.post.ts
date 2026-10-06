import {
  AccessGate,
  defineHandler,
  defineModelAnnotation,
  defineModelContext,
} from "@asmblyr-collaborative/kit";
import type { GoogleSheet } from "@asmblyr-collaborative/kit";

import { google } from "../../connection.ts";
interface Input {
  fileId: string;
}
export default defineModelContext<Input>(
  defineHandler(async (event): Promise<GoogleSheet> => {
    const input = (await event.req.json()) as Input;
    return google(event).sheet(input.fileId);
  }),
  defineModelAnnotation({
    title: "Структура Google Sheets",
    description:
      "Read spreadsheet title and tab names to choose an explicit bounded A1 range. Cite its source URL.",
    middleware: AccessGate.authenticated,
    connection: "google",
    readOnly: true,
  }),
);
