export type AssistantSkillStatus = "draft" | "active";
export type AssistantSkillScope = "global" | "collections";
export type AssistantSkillAudience = "all" | "policies";
export type AssistantSkillChannel = "assistant" | "mcp";

export interface AssistantSkillCollectionRef {
  name: string;
  displayName: string;
  mcpEnabled: boolean;
}

export interface AssistantSkillPolicyRef {
  id: string;
  name: string;
}

export interface AssistantSkillCoverage {
  audienceUsersCount: number;
  collectionNames: string[];
  mcpReady: boolean;
}

export interface AssistantSkill {
  id: string;
  slug: string;
  title: string;
  description: string;
  instructions: string;
  examples: string[];
  scope: AssistantSkillScope;
  audience: AssistantSkillAudience;
  status: AssistantSkillStatus;
  exposeToMcp: boolean;
  collections: string[];
  collectionDetails: AssistantSkillCollectionRef[];
  policyIds: string[];
  policies: AssistantSkillPolicyRef[];
  manageable: boolean;
  coverage: AssistantSkillCoverage;
  createdBy: string | null;
  createdByName: string | null;
  updatedBy: string | null;
  updatedByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantSkillInput {
  slug: string;
  title: string;
  description: string;
  instructions: string;
  examples: string[];
  scope: AssistantSkillScope;
  audience: AssistantSkillAudience;
  status: AssistantSkillStatus;
  exposeToMcp: boolean;
  collections: string[];
  policyIds: string[];
}

export interface AssistantSkillSummary {
  slug: string;
  title: string;
  description: string;
  examples: string[];
  scope: AssistantSkillScope;
  collections: string[];
  exposeToMcp: boolean;
  updatedAt: string;
}

export interface AssistantSkillRelatedTerm {
  collection: string;
  id: string;
  name: string;
  description: string;
  aliases: string[];
  filter: object;
}

export interface AssistantSkillDetail extends AssistantSkillSummary {
  instructions: string;
  relatedTerms: AssistantSkillRelatedTerm[];
}

export interface AssistantSkillAdminMeta {
  superuser: boolean;
  canCreate: boolean;
  canUseGlobalScope: boolean;
  canUseAllAudience: boolean;
  delegatablePolicyIds: string[];
}

export interface AssistantSkillAdminListResult {
  data: AssistantSkill[];
  meta: AssistantSkillAdminMeta;
}
