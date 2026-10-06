import { randomUUID } from "node:crypto";
import type {
  ConnectionWriteProposal,
  ConnectionWriteDetail,
  ConnectionWriteResult,
  ConnectionWriteStatus,
} from "@asmblyr-collaborative/contracts";
import type { GoogleWriteInput } from "@asmblyr-collaborative/kit";
import { securityEvent } from "../../auth/security-events.js";
import { integrationError } from "../../integrations/types.js";
import { withConnectionVault } from "../vault.js";
import { hash, type GoogleConnections } from "./connections.js";
import { GoogleClient } from "./client.js";
import { writeInput } from "./write-input.js";
import { executeGoogleWrite } from "./write-execute.js";
import { googleWriteResult, googleWriteUrl } from "./write-result.js";

interface SavedWrite {
  input: GoogleWriteInput;
  proposal: ConnectionWriteProposal;
  before: string | null;
  result?: ConnectionWriteResult;
  failure?: "target_changed";
}
interface WriteRow {
  id: string;
  owner_id: string;
  connection_id: string;
  status: ConnectionWriteStatus;
  expires_at: Date;
}
const unavailable = () =>
  integrationError("connection_proposal_unavailable", 404);

async function snapshot(client: GoogleClient, input: GoogleWriteInput) {
  if (!input.fileId) {
    return { name: input.title!, url: "", fingerprint: null };
  }
  if (
    input.operation === "update_cells" ||
    input.operation === "append_cells"
  ) {
    const sheet = await client.sheet(input.fileId);
    const cells = await client.cells({
      fileId: input.fileId,
      range: input.range!,
    });
    return {
      name: sheet.title,
      url: sheet.url,
      fingerprint: hash(JSON.stringify(cells)),
    };
  }
  const file = await client.metadata(input.fileId);
  if (input.operation === "update_text" && !/^text\//.test(file.mimeType)) {
    throw integrationError("connection_text_write_only", 422);
  }
  return {
    name: file.name,
    url: file.url,
    fingerprint: hash(JSON.stringify([file.name, file.version])),
  };
}

export class GoogleWrites {
  constructor(readonly connections: GoogleConnections) {}
  async propose(
    owner: string,
    value: unknown,
    signal?: AbortSignal,
  ): Promise<ConnectionWriteProposal> {
    const input = writeInput(value);
    const client = new GoogleClient(this.connections, owner, signal);
    const connection = await this.connections.accessToken(owner);
    const before = await snapshot(client, input);
    signal?.throwIfAborted();
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + 1200000);
    const proposal: ConnectionWriteProposal = {
      id,
      provider: "google",
      operation: input.operation,
      title: input.title ?? before.name,
      target: input.fileId
        ? `${before.name}${input.range ? ` · ${input.range}` : ""}`
        : `${input.operation === "create_sheet" ? "Google Sheets" : "Google Drive"} · ${before.name}`,
      content: input.values
        ? JSON.stringify(input.values, null, 2)
        : (input.content ?? input.title ?? ""),
      expiresAt: expiresAt.toISOString(),
    };
    await withConnectionVault(this.connections.settings, async (vault) => {
      signal?.throwIfAborted();
      const row = await this.connections.connection(vault, owner);
      if (row.id !== connection.connectionId) {
        throw unavailable();
      }
      const count = await vault
        .db("asmblyr_connection_writes")
        .where({ owner_id: owner, status: "pending" })
        .where("expires_at", ">", new Date())
        .count("id as count")
        .first();
      if (Number(count?.count) >= 32) {
        throw integrationError("connection_proposal_limit", 429);
      }
      await vault.write(
        id,
        owner,
        { input, proposal, before: before.fingerprint },
        expiresAt,
      );
      await vault.db("asmblyr_connection_writes").insert({
        id,
        owner_id: owner,
        connection_id: row.id,
        expires_at: expiresAt,
      });
    });
    return proposal;
  }
  async get(owner: string, id: string): Promise<ConnectionWriteDetail> {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
      throw unavailable();
    }
    return withConnectionVault(this.connections.settings, async (vault) => {
      const row = await vault
        .db<WriteRow>("asmblyr_connection_writes")
        .where({ id, owner_id: owner })
        .first();
      if (!row || row.expires_at.getTime() < Date.now()) {
        throw unavailable();
      }
      const connection = await this.connections.connection(vault, owner);
      if (connection.id !== row.connection_id) {
        throw unavailable();
      }
      const saved = await vault.read<SavedWrite>(id, owner);
      return {
        ...saved.proposal,
        status: row.status,
        url: googleWriteUrl(saved.input),
        result: saved.result ?? null,
        failure: saved.failure ?? null,
      };
    });
  }
  async cancel(owner: string, id: string) {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
      throw unavailable();
    }
    await withConnectionVault(this.connections.settings, async (vault) => {
      const row = await vault
        .db<WriteRow>("asmblyr_connection_writes")
        .where({ id, owner_id: owner, status: "pending" })
        .first();
      if (!row || row.expires_at.getTime() < Date.now()) {
        throw unavailable();
      }
      const connection = await this.connections.connection(vault, owner);
      if (connection.id !== row.connection_id) {
        throw unavailable();
      }
      // Retain the encrypted preview until its existing TTL so the outcome is reviewable.
      await vault
        .db("asmblyr_connection_writes")
        .where({ id })
        .update({ status: "cancelled" });
    });
    return { cancelled: true };
  }
  async confirm(owner: string, id: string) {
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(id)) {
      throw unavailable();
    }
    const claimed = await withConnectionVault(
      this.connections.settings,
      async (vault) => {
        const row = await vault
          .db<WriteRow>("asmblyr_connection_writes")
          .where({ id, owner_id: owner, status: "pending" })
          .first();
        if (!row || row.expires_at.getTime() < Date.now()) {
          throw unavailable();
        }
        const connection = await this.connections.connection(vault, owner);
        if (row.connection_id !== connection.id) {
          throw unavailable();
        }
        const saved = await vault.read<SavedWrite>(id, owner);
        await vault
          .db("asmblyr_connection_writes")
          .where({ id })
          .update({ status: "executing" });
        return { ...saved, connectionId: connection.id };
      },
    );
    const client = new GoogleClient(
      this.connections,
      owner,
      undefined,
      claimed.connectionId,
    );
    let status: "failed" | "uncertain" | "succeeded" = "failed";
    let result: object = {};
    let receipt: ConnectionWriteResult | undefined;
    try {
      const current = await snapshot(client, claimed.input);
      if (current.fingerprint !== claimed.before) {
        throw integrationError("connection_target_changed", 409);
      }
      // There is no cross-service transaction. Never replay a write after a timeout.
      status = "uncertain";
      result = await executeGoogleWrite(client, claimed.input);
      receipt = googleWriteResult(claimed.input, result);
      status = "succeeded";
    } catch (error) {
      const targetChanged =
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "connection_target_changed";
      await this.complete(
        owner,
        id,
        status,
        claimed.input.operation,
        undefined,
        targetChanged ? "target_changed" : undefined,
      );
      if (status === "uncertain") {
        return {
          status,
          message: "Проверьте результат в Google перед новой операцией.",
        };
      }
      throw error;
    }
    await this.complete(owner, id, status, claimed.input.operation, receipt);
    return { status, result };
  }
  private async complete(
    owner: string,
    id: string,
    status: ConnectionWriteStatus,
    operation: string,
    result?: ConnectionWriteResult,
    failure?: "target_changed",
  ) {
    await withConnectionVault(this.connections.settings, async (vault) => {
      const row = await vault
        .db<WriteRow>("asmblyr_connection_writes")
        .where({ id, owner_id: owner })
        .first();
      if (row) {
        const saved = await vault.read<SavedWrite>(id, owner);
        await vault.write(id, owner, {
          ...saved,
          ...(result ? { result } : {}),
          ...(failure ? { failure } : {}),
        });
      }
      await vault
        .db("asmblyr_connection_writes")
        .where({ id, owner_id: owner })
        .update({ status });
      await securityEvent(vault.db, owner, "connection.write", owner, {
        provider: "google",
        operation,
        status,
      });
    });
  }
}
