import type { ConnectionWriteProposal } from "@asmblyr-collaborative/contracts";

export interface GoogleFile {
  id: string;
  name: string;
  mimeType: string;
  url: string;
}
export interface GoogleFileList {
  files: GoogleFile[];
  nextPageToken: string | null;
}
export interface GoogleText {
  file: GoogleFile;
  content: string;
  truncated: boolean;
}
export interface GoogleSheet {
  id: string;
  title: string;
  url: string;
  sheets: { title: string; rows: number; columns: number }[];
}
export interface GoogleCells {
  spreadsheetId: string;
  range: string;
  values: (string | number | boolean)[][];
}
export interface GoogleWriteInput {
  operation:
    | "create_text"
    | "update_text"
    | "rename_file"
    | "trash_file"
    | "create_sheet"
    | "update_cells"
    | "append_cells";
  fileId: string | null;
  title: string | null;
  range: string | null;
  content: string | null;
  values: (string | number | boolean)[][] | null;
}
/** Owner-bound host broker. Never exposes credentials or arbitrary authenticated URLs. */
export interface PersonalConnections {
  google: {
    list(input: {
      query: string;
      pageToken: string | null;
    }): Promise<GoogleFileList>;
    readText(fileId: string): Promise<GoogleText>;
    sheet(fileId: string): Promise<GoogleSheet>;
    cells(input: { fileId: string; range: string }): Promise<GoogleCells>;
    /** Creates a proposal only; Google writes require a separate human confirmation. */
    proposeWrite(input: GoogleWriteInput): Promise<ConnectionWriteProposal>;
  };
}
