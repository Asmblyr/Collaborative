import type { ItemFilterOperator } from "./item-filter.js";

export type PermissionContextPath =
  | "user.id"
  | "user.email"
  | "service.id"
  | "actor.id"
  | "request.now";
export type PermissionOperand =
  | { kind: "literal"; value: string | string[] }
  | { kind: "context"; path: PermissionContextPath };
export interface PermissionCondition {
  field: string;
  op: Exclude<ItemFilterOperator, "exists" | "notExists">;
  value?: PermissionOperand;
}
export interface PermissionFilter {
  logic: "and" | "or";
  children: (PermissionCondition | PermissionFilter)[];
}
export interface PermissionRule {
  fields: string[];
  rowFilter?: PermissionFilter | null;
}
export const permissionContextParameters: readonly {
  path: PermissionContextPath;
  label: string;
  description: string;
  type: "uuid" | "email" | "datetime";
}[];
