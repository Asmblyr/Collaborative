export type { ServiceKey } from "@asmblyr-collaborative/contracts";
import type { ServiceKey } from "@asmblyr-collaborative/contracts";
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
