import type { PersonalConnections } from "@asmblyr-collaborative/kit";
import { GoogleClient } from "./google/client.js";
import type { GoogleConnections } from "./google/connections.js";
import { GoogleWrites } from "./google/writes.js";

export function personalConnections(
  service: GoogleConnections,
  owner: string,
  signal: AbortSignal,
): PersonalConnections {
  const client = new GoogleClient(service, owner, signal);
  return Object.freeze({
    google: Object.freeze({
      list: (input: { query: string; pageToken: string | null }) =>
        client.list(input),
      readText: (id: string) => client.readText(id),
      sheet: (id: string) => client.sheet(id),
      cells: (input: { fileId: string; range: string }) => client.cells(input),
      proposeWrite: (
        input: import("@asmblyr-collaborative/kit").GoogleWriteInput,
      ) => new GoogleWrites(service).propose(owner, input, signal),
    }),
  });
}
