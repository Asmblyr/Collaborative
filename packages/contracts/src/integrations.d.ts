export type IntegrationSection =
  | "storage"
  | "assistant"
  | "encryption"
  | "monitoring"
  | "google";
export interface GoogleConnection {
  enabled: boolean;
  clientId: string;
  redirectUri: string;
}
export interface StorageConnection {
  enabled: boolean;
  provider: "s3" | "yandex";
  bucket: string;
  region: string;
  endpoint: string;
  serviceAccountId: string;
}
export interface AssistantConnection {
  enabled: boolean;
  baseURL: string;
  model: string;
  api: "responses" | "chat-completions";
  timeoutMs: number;
  maxOutputTokens: number;
  effort: "" | "low" | "medium" | "high" | "max";
  thinking: boolean | null;
}
export interface EncryptionConnection {
  provider: "local" | "yandex-kms";
  keyId: string;
  serviceAccountId: string;
}
export interface IntegrationValues {
  monitoring: MonitoringConnection;
  google: GoogleConnection;
  storage: StorageConnection;
  assistant: AssistantConnection;
  encryption: EncryptionConnection;
}
export type IntegrationSecret =
  | "accessKeyId"
  | "secretAccessKey"
  | "sessionToken"
  | "apiKey"
  /** Legacy common monitoring DSN. Submit alone; prefer serverDsn/browserDsn. */
  | "dsn"
  | "serverDsn"
  | "browserDsn"
  | "clientSecret";
export interface IntegrationState<T> {
  source: "environment" | "admin";
  readOnly: boolean;
  value: T;
  secrets: Partial<Record<IntegrationSecret, boolean>>;
}
export interface IntegrationsSnapshot {
  monitoring: IntegrationState<MonitoringConnection>;
  google: IntegrationState<GoogleConnection>;
  revision: string;
  storage: IntegrationState<StorageConnection>;
  assistant: IntegrationState<AssistantConnection>;
  encryption: IntegrationState<EncryptionConnection>;
  bootstrap: { localKey: boolean; workloadIdentity: boolean };
  savedSecretCount: number;
}
/** Secrets are write-only. Omission preserves an existing secret; null explicitly removes it. */
export interface IntegrationUpdate<T = IntegrationValues[IntegrationSection]> {
  revision: string;
  value: T;
  secrets?: Partial<Record<IntegrationSecret, string | null>>;
}
import type { MonitoringConnection } from "./monitoring.js";
