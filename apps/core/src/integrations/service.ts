import { randomUUID } from "node:crypto";
import type { Knex } from "knex";
import type {
  IntegrationSection,
  IntegrationValues,
  IntegrationsSnapshot,
  IntegrationUpdate,
} from "@asmblyr-collaborative/contracts";
import { securityEvent } from "../auth/security-events.js";
import { environmentLocked, environmentValues } from "./environment.js";
import {
  initialValues,
  integrationError,
  type IntegrationRow,
} from "./types.js";
import {
  IntegrationProviders,
  storageLocation,
  type IntegrationOptions,
} from "./providers.js";
import { secretNames, updateInput } from "./validation.js";
import { checkConnection, verifyCipher } from "./checks.js";
import {
  assertConnectionEncryption,
  rotateConnectionSecrets,
} from "../connections/vault.js";
import { validateMonitoringDsns } from "../monitoring/config.js";
import {
  monitoringDsnsFromEnv,
  monitoringDsnSlot,
  type MonitoringDsnName,
} from "../monitoring/dsn.js";
import { prepareMonitoringSecrets } from "./monitoring-secrets.js";

export class IntegrationService {
  readonly providers: IntegrationProviders;
  constructor(
    readonly database: Knex,
    options: IntegrationOptions,
  ) {
    this.providers = new IntegrationProviders(options);
  }
  table(db = this.database) {
    return db<IntegrationRow>("asmblyr_integration_settings").withSchema(
      "public",
    );
  }
  async row() {
    const row = await this.table().where({ id: 1 }).first();
    if (!row) {
      throw integrationError("integration_configuration_invalid", 503);
    }
    return row;
  }
  locked(section: IntegrationSection) {
    return environmentLocked(this.providers.options.env, section);
  }
  values(row: IntegrationRow): IntegrationValues {
    const environment = environmentValues(this.providers.options.env);
    return Object.fromEntries(
      Object.keys(initialValues).map((key) => {
        const section = key as IntegrationSection;
        return [
          section,
          this.locked(section)
            ? environment[section]
            : (row.values[section] ?? initialValues[section]),
        ];
      }),
    ) as unknown as IntegrationValues;
  }
  async snapshot(input?: IntegrationRow): Promise<IntegrationsSnapshot> {
    const row = input ?? (await this.row());
    const values = this.values(row);
    const env = this.providers.options.env;
    const state = <S extends IntegrationSection>(section: S) => {
      const locked = this.locked(section);
      const secrets = Object.fromEntries(
        secretNames[section].map((key) => {
          if (section === "monitoring") {
            const configured = locked
              ? monitoringDsnsFromEnv(env)[key]
              : monitoringDsnSlot(row.secrets, key as MonitoringDsnName);
            return [key, Boolean(configured)];
          }
          const name = {
            accessKeyId: "AWS_ACCESS_KEY_ID",
            secretAccessKey: "AWS_SECRET_ACCESS_KEY",
            sessionToken: "AWS_SESSION_TOKEN",
            apiKey: "OPENAI_API_KEY",
            clientSecret: "GOOGLE_WORKSPACE_CLIENT_SECRET",
            dsn: "SENTRY_DSN",
            serverDsn: "SENTRY_DSN",
            browserDsn: "SENTRY_BROWSER_DSN",
          }[key];
          const configured = locked
            ? env[name]
            : row.secrets[`${section}.${key}`];
          return [key, Boolean(configured)];
        }),
      );
      return {
        source: locked ? ("environment" as const) : ("admin" as const),
        readOnly: locked,
        value: values[section],
        secrets,
      };
    };
    return {
      revision: row.revision,
      monitoring: state("monitoring"),
      google: state("google"),
      storage: state("storage"),
      assistant: state("assistant"),
      encryption: state("encryption"),
      bootstrap: {
        localKey: Boolean(env.SECRETS_LOCAL_KEY),
        workloadIdentity: Boolean(
          env.YC_OIDC_TOKEN_FILE ?? env.FILES_YC_TOKEN_FILE,
        ),
      },
      savedSecretCount:
        Object.keys(row.secrets).length +
        Number(
          (
            await this.database("asmblyr_connection_secrets")
              .count("id as count")
              .first()
          )?.count ?? 0,
        ),
    };
  }
  context(slot: string, row: IntegrationRow) {
    return `asmblyr/integration/v1/${row.binding}/${slot}`;
  }
  encryptionValue(row: IntegrationRow) {
    const stored = row.values.encryption ?? initialValues.encryption;
    const effective = this.values(row).encryption;
    if (
      this.locked("encryption") &&
      Object.keys(row.secrets).length &&
      (stored.provider !== effective.provider ||
        (effective.provider === "yandex-kms" &&
          (stored.keyId !== effective.keyId ||
            stored.serviceAccountId !== effective.serviceAccountId)))
    ) {
      throw integrationError("integration_encryption_migration_required", 503);
    }
    return effective;
  }
  async reveal(
    row: IntegrationRow,
    section: IntegrationSection,
  ): Promise<Record<string, string>> {
    if (this.locked(section)) {
      return {};
    }
    const result: Record<string, string> = {};
    const stored = row.values.encryption ?? initialValues.encryption;
    this.encryptionValue(row);
    for (const name of secretNames[section]) {
      const slot =
        section === "monitoring"
          ? monitoringDsnSlot(row.secrets, name as MonitoringDsnName)
          : `${section}.${name}`;
      if (slot && row.secrets[slot]) {
        result[name] = await this.providers
          .cipher(stored)
          .decrypt(row.secrets[slot], this.context(slot, row));
      }
    }
    return result;
  }
  private assertRevision(row: IntegrationRow, revision: string) {
    if (revision !== row.revision) {
      throw integrationError("integration_revision_conflict", 409);
    }
  }
  private async apply(
    row: IntegrationRow,
    section: IntegrationSection,
    input: IntegrationUpdate,
    deadline = Date.now() + 80000,
    db = this.database,
  ) {
    this.assertRevision(row, input.revision);
    if (Date.now() > deadline) {
      throw integrationError("integration_connection_failed", 503);
    }
    const next: IntegrationRow = {
      ...row,
      values: { ...row.values, [section]: input.value },
      secrets: { ...row.secrets },
    };
    if (section === "encryption") {
      const cipher = this.providers.cipher(
        input.value as IntegrationValues["encryption"],
      );
      await verifyCipher(cipher);
      for (const [slot, ciphertext] of Object.entries(row.secrets)) {
        const old = this.providers.cipher(
          row.values.encryption ?? initialValues.encryption,
        );
        next.secrets[slot] = await cipher.encrypt(
          await old.decrypt(ciphertext, this.context(slot, row)),
          this.context(slot, row),
        );
        if (Date.now() > deadline) {
          throw integrationError("integration_connection_failed", 503);
        }
      }
    } else {
      if (
        Object.values(input.secrets ?? {}).some(
          (value) => typeof value === "string",
        )
      ) {
        await assertConnectionEncryption(this, row, db);
      }
      if (section === "monitoring") {
        await prepareMonitoringSecrets(this, row, next, input, db);
      }
      for (const [name, value] of Object.entries(input.secrets ?? {})) {
        const slot = `${section}.${name}`;
        if (value === null) {
          delete next.secrets[slot];
        } else if (value !== undefined) {
          const encryption = this.encryptionValue(row);
          const cipher = this.providers.cipher(encryption);
          next.secrets[slot] = await cipher.encrypt(
            value,
            this.context(slot, row),
          );
          next.values.encryption = encryption;
        }
      }
      const connection = next.values[section]!;
      if (section === "monitoring" && connection.enabled) {
        validateMonitoringDsns(
          next.values.monitoring!,
          await this.reveal(next, section),
        );
      }
      if (connection.enabled) {
        if (section === "google" && !next.secrets["google.clientSecret"]) {
          throw integrationError("integration_credentials_missing");
        }
        if (section === "assistant" && !next.secrets["assistant.apiKey"]) {
          throw integrationError("integration_credentials_missing");
        }
        if (
          section === "storage" &&
          (connection as IntegrationValues["storage"]).provider === "s3" &&
          (!next.secrets["storage.accessKeyId"] ||
            !next.secrets["storage.secretAccessKey"])
        ) {
          throw integrationError("integration_credentials_missing");
        }
        if (
          section === "storage" &&
          (connection as IntegrationValues["storage"]).provider === "yandex" &&
          !(
            this.providers.options.env.YC_OIDC_TOKEN_FILE ??
            this.providers.options.env.FILES_YC_TOKEN_FILE
          )
        ) {
          throw integrationError("integration_identity_missing");
        }
      }
    }
    return next;
  }
  async save(section: IntegrationSection, body: unknown, actorId: string) {
    const deadline = Date.now() + 80000;
    if (this.locked(section)) {
      throw integrationError("integration_environment_locked", 409);
    }
    const input = updateInput(section, body);
    const saved = await this.database.transaction(async (trx) => {
      const row = (await this.table(trx).where({ id: 1 }).forUpdate().first())!;
      const next = await this.apply(row, section, input, deadline, trx);
      if (section === "encryption") {
        await rotateConnectionSecrets(trx, this, row, next, deadline);
      }
      if (Date.now() > deadline) {
        throw integrationError("integration_connection_failed", 503);
      }
      if (section === "storage") {
        const location = storageLocation(next.values.storage!);
        const existing = await trx("asmblyr_files")
          .withSchema("public")
          .whereNot({ storage: location })
          .first("id");
        if (existing) {
          throw integrationError("integration_storage_has_files", 409);
        }
      }
      next.revision = randomUUID();
      await this.table(trx)
        .where({ id: 1 })
        .update({
          revision: next.revision,
          updated_at: trx.fn.now(),
          values: JSON.stringify(next.values) as never,
          secrets: JSON.stringify(next.secrets) as never,
        });
      await securityEvent(trx, actorId, "integration.updated", actorId, {
        section,
        provider: this.values(next).encryption.provider,
        savedSecretCount: Object.keys(next.secrets).length,
      });
      return next;
    });
    return this.snapshot(saved);
  }
  async check(section: IntegrationSection, body: unknown) {
    const row = await this.row();
    const input = this.locked(section) ? null : updateInput(section, body);
    if (input) {
      this.assertRevision(row, input.revision);
    }
    const next =
      input && section !== "encryption"
        ? await this.apply(row, section, input)
        : row;
    const values = this.values(next);
    if (section === "encryption" && input) {
      values.encryption = input.value as IntegrationValues["encryption"];
    }
    const needsSecret =
      section === "monitoring" ||
      section === "assistant" ||
      section === "google" ||
      (section === "storage" && values.storage.provider === "s3");
    const secrets = needsSecret ? await this.reveal(next, section) : {};
    await checkConnection(
      this.providers,
      section,
      values,
      secrets,
      this.locked(section),
    );
    return { ok: true as const };
  }
}
