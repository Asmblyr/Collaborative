import type { Knex } from "knex";
import type { IntegrationUpdate } from "@asmblyr-collaborative/contracts";
import { assertConnectionEncryption } from "../connections/vault.js";
import { monitoringDsnNames } from "../monitoring/dsn.js";
import type { IntegrationService } from "./service.js";
import { initialValues, type IntegrationRow } from "./types.js";

/** Preserve the unedited target before a common DSN is replaced or removed. */
export async function prepareMonitoringSecrets(
  service: IntegrationService,
  row: IntegrationRow,
  next: IntegrationRow,
  input: IntegrationUpdate,
  db: Knex,
): Promise<void> {
  const patch = input.secrets ?? {};
  if (!Object.keys(patch).length) {
    return;
  }
  if (Object.hasOwn(patch, "dsn")) {
    for (const name of monitoringDsnNames) {
      delete next.secrets[`monitoring.${name}`];
    }
    return;
  }
  const common = row.secrets["monitoring.dsn"];
  if (!common) {
    return;
  }
  const preserve = monitoringDsnNames.filter(
    (name) =>
      !Object.hasOwn(patch, name) && !next.secrets[`monitoring.${name}`],
  );
  if (preserve.length) {
    await assertConnectionEncryption(service, row, db);
    const stored = row.values.encryption ?? initialValues.encryption;
    const plaintext = await service.providers
      .cipher(stored)
      .decrypt(common, service.context("monitoring.dsn", row));
    const encryption = service.encryptionValue(row);
    const cipher = service.providers.cipher(encryption);
    for (const name of preserve) {
      const slot = `monitoring.${name}`;
      next.secrets[slot] = await cipher.encrypt(
        plaintext,
        service.context(slot, row),
      );
    }
    next.values.encryption = encryption;
  }
  delete next.secrets["monitoring.dsn"];
}
