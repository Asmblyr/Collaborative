export interface OAuthApplication {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  clientType: "public" | "confidential";
  redirectUris: string[];
  userIds: string[];
  accessMode: "all" | "selected" | "domains";
  emailDomains: string[];
  audience: string;
  scopes: string[];
  policyManaged: boolean;
  scopeLabels: Record<string, string>;
}

export interface OAuthUser {
  id: string;
  email: string;
  status: string;
}
export type ApplicationDraft = Omit<OAuthApplication, "id">;
