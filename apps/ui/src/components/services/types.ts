export interface ServiceKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
export interface ServiceAccount {
  id: string;
  name: string;
  description: string;
  status: "active" | "disabled";
  createdAt: string;
  policyIds: string[];
}
export interface ServiceFederation {
  id: string;
  name: string;
  projectId: string;
  projectPath: string;
  ref: string;
  audience: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
}
export interface ServiceDetail extends ServiceAccount {
  keys: ServiceKey[];
  federations: ServiceFederation[];
}
export interface ServicePolicy {
  id: string;
  name: string;
}
