import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import type { IntegrationService } from "../integrations/service.js";
import {
  initialValues,
  integrationError,
  type IntegrationRow,
} from "../integrations/types.js";
import type { Ciphertext } from "../secrets/cipher.js";

interface VaultRow {
  id: string;
  owner_id: string;
  ciphertext: Ciphertext;
  expires_at: Date | null;
}
const context = (id: string) => `asmblyr/connection/v1/${id}`;

export async function assertConnectionEncryption(
  settings: IntegrationService,
  row: IntegrationRow,
  db: Knex,
  hasCiphertext = false,
) {
  const effective = settings.encryptionValue(row);
  const stored = row.values.encryption ?? initialValues.encryption;
  const changed =
    stored.provider !== effective.provider ||
    (effective.provider === "yandex-kms" &&
      (stored.keyId !== effective.keyId ||
        stored.serviceAccountId !== effective.serviceAccountId));
  if (
    changed &&
    (hasCiphertext ||
      (await db("asmblyr_connection_secrets").withSchema("public").first("id")))
  ) {
    throw integrationError("integration_encryption_migration_required", 503);
  }
}

/** All vault mutations share the configuration lock with provider rotation. */
export async function withConnectionVault<T>(
  settings: IntegrationService,
  run: (vault: ConnectionVault) => Promise<T>,
): Promise<T> {
  return settings.database.transaction(async (db) => {
    const row = (await settings
      .table(db)
      .where({ id: 1 })
      .forUpdate()
      .first())!;
    return run(new ConnectionVault(db, settings, row));
  });
}

export class ConnectionVault {
  constructor(
    readonly db: Knex,
    private readonly settings: IntegrationService,
    readonly row: IntegrationRow,
  ) {}
  table() {
    return this.db<VaultRow>("asmblyr_connection_secrets").withSchema("public");
  }
  async read<T>(id: string, owner: string): Promise<T> {
    const secret = await this.table().where({ id, owner_id: owner }).first();
    if (!secret) {
      throw integrationError("connection_unavailable", 404);
    }
    await assertConnectionEncryption(this.settings, this.row, this.db, true);
    const stored = this.row.values.encryption ?? initialValues.encryption;
    const plaintext = await this.settings.providers
      .cipher(stored)
      .decrypt(secret.ciphertext, context(id));
    return JSON.parse(plaintext) as T;
  }
  async write(
    id: string,
    owner: string,
    value: object,
    expiresAt: Date | null = null,
  ) {
    const encryption = this.settings.encryptionValue(this.row);
    await assertConnectionEncryption(this.settings, this.row, this.db);
    const ciphertext = await this.settings.providers
      .cipher(encryption)
      .encrypt(JSON.stringify(value), context(id));
    await this.table()
      .insert({
        id,
        owner_id: owner,
        ciphertext: JSON.stringify(ciphertext) as never,
        expires_at: expiresAt,
      })
      .onConflict("id")
      .merge(["ciphertext"]);
    this.row.values = { ...this.row.values, encryption };
    await this.settings
      .table(this.db)
      .where({ id: 1 })
      .update({
        values: JSON.stringify(this.row.values) as never,
        revision: randomUUID(),
      });
  }
  async remove(id: string, owner: string) {
    await this.table().where({ id, owner_id: owner }).delete();
  }
}

export async function rotateConnectionSecrets(
  db: Knex,
  settings: IntegrationService,
  old: IntegrationRow,
  next: IntegrationRow,
  deadline: number,
) {
  const previous = settings.providers.cipher(
    old.values.encryption ?? initialValues.encryption,
  );
  const cipher = settings.providers.cipher(next.values.encryption!);
  const rows = await db<VaultRow>("asmblyr_connection_secrets")
    .withSchema("public")
    .select();
  for (const row of rows) {
    if (Date.now() > deadline) {
      throw integrationError("integration_connection_failed", 503);
    }
    const plaintext = await previous.decrypt(row.ciphertext, context(row.id));
    const ciphertext = await cipher.encrypt(plaintext, context(row.id));
    await db("asmblyr_connection_secrets")
      .withSchema("public")
      .where({ id: row.id })
      .update({ ciphertext: JSON.stringify(ciphertext) });
  }
}
