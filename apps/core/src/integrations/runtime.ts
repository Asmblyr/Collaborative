import type { AssistantService } from "../assistant/service.js";
import type { FileStorage } from "../files/storage/types.js";
import type { Knex } from "knex";
import { IntegrationService } from "./service.js";

export class IntegrationRuntime {
  private storageCache?: {
    revision: string;
    value: Promise<FileStorage | null>;
  };
  private assistantCache?: {
    revision: string;
    value: Promise<AssistantService | null>;
  };
  private readonly clients = new Set<FileStorage>();
  constructor(readonly settings: IntegrationService) {}

  readonly storage = async (database?: Knex) => {
    const row = database
      ? (await this.settings.table(database).where({ id: 1 }).first())!
      : await this.settings.row();
    if (this.storageCache?.revision !== row.revision) {
      const value = (async () => {
        if (
          !this.settings.locked("storage") &&
          !this.settings.values(row).storage.enabled
        ) {
          return null;
        }
        const connection = this.settings.values(row).storage;
        const secrets =
          connection.provider === "yandex"
            ? {}
            : await this.settings.reveal(row, "storage");
        const provider = this.settings.providers.storage(
          connection,
          secrets,
          this.settings.locked("storage"),
        );
        if (provider) {
          this.clients.add(provider);
        }
        return provider;
      })();
      this.storageCache = { revision: row.revision, value };
      value.catch(() => {
        if (this.storageCache?.value === value) {
          this.storageCache = undefined;
        }
      });
    }
    return this.storageCache.value;
  };
  readonly assistant = async () => {
    const row = await this.settings.row();
    if (this.assistantCache?.revision !== row.revision) {
      const value = (async () => {
        if (
          !this.settings.locked("assistant") &&
          !this.settings.values(row).assistant.enabled
        ) {
          return null;
        }
        return this.settings.providers.assistant(
          this.settings.values(row).assistant,
          await this.settings.reveal(row, "assistant"),
          this.settings.locked("assistant"),
        );
      })();
      this.assistantCache = { revision: row.revision, value };
      value.catch(() => {
        if (this.assistantCache?.value === value) {
          this.assistantCache = undefined;
        }
      });
    }
    return this.assistantCache.value;
  };
  close() {
    for (const client of this.clients) {
      client.close?.();
    }
    this.clients.clear();
  }
}
