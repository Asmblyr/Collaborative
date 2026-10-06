import type { IntegrationValues } from "@asmblyr-collaborative/contracts";
import type { Ciphertext } from "../secrets/cipher.js";
import { monitoringDefaults } from "../monitoring/defaults.js";

export interface IntegrationRow {
  id: number;
  revision: string;
  binding: string;
  updated_at?: Date;
  values: Partial<IntegrationValues>;
  secrets: Record<string, Ciphertext>;
}

export const initialValues: IntegrationValues = {
  monitoring: monitoringDefaults,
  google: { enabled: false, clientId: "", redirectUri: "" },
  storage: {
    enabled: false,
    provider: "s3",
    bucket: "",
    region: "",
    endpoint: "",
    serviceAccountId: "",
  },
  assistant: {
    enabled: false,
    baseURL: "https://api.openai.com/v1/",
    model: "",
    api: "responses",
    timeoutMs: 120000,
    maxOutputTokens: 4096,
    effort: "",
    thinking: null,
  },
  encryption: { provider: "local", keyId: "", serviceAccountId: "" },
};

export function integrationError(code: string, statusCode = 400) {
  return Object.assign(new Error(code), { code, statusCode });
}
