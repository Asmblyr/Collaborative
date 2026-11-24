import { userDisplayName } from "@/lib/user-profile";
import type {
  AccessUser,
  EffectivePermission,
  Permission,
  PolicyCollection,
} from "./types";

export type UserStatusCategory = "active" | "disabled" | "invited";

export function accessText(locale: string, ru: string, en: string): string {
  return locale === "en" ? en : ru;
}

export function normalizeAccessSearch(value: string): string {
  return value.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
}

export function matchesAccessSearch(
  fields: (string | null | undefined)[],
  query: string,
): boolean {
  const normalized = normalizeAccessSearch(query);
  if (!normalized) {
    return true;
  }
  return fields.some(
    (field) =>
      typeof field === "string" &&
      normalizeAccessSearch(field).includes(normalized),
  );
}

export function userStatusCategory(
  user: Pick<
    AccessUser,
    "status" | "superuser" | "hasPassword" | "invitationPending"
  >,
): UserStatusCategory {
  if (user.status === "disabled") {
    return "disabled";
  }
  if (!user.superuser && !user.hasPassword && user.invitationPending) {
    return "invited";
  }
  return "active";
}

export function compareUsersByName(
  left: Pick<AccessUser, "displayName" | "firstName" | "lastName" | "email">,
  right: Pick<AccessUser, "displayName" | "firstName" | "lastName" | "email">,
): number {
  const leftName = normalizeAccessSearch(userDisplayName(left));
  const rightName = normalizeAccessSearch(userDisplayName(right));
  const byName = leftName.localeCompare(rightName, "ru", {
    sensitivity: "base",
  });
  if (byName !== 0) {
    return byName;
  }
  return left.email.localeCompare(right.email, "ru", { sensitivity: "base" });
}

const ACCESS_ERROR_TRANSLATIONS: Record<string, string> = {
  "Email already exists":
    "Пользователь с такой электронной почтой уже существует.",
  "Policy name already exists": "Политика с таким названием уже существует.",
  "Cannot change your own account status":
    "Нельзя изменить статус собственной учётной записи.",
  "Cannot disable your own account":
    "Нельзя отключить собственную учётную запись.",
  "Cannot disable the last active superuser":
    "Нельзя отключить последнего активного суперпользователя.",
  "Invited user must accept the invitation to activate":
    "Приглашённый пользователь активируется после принятия приглашения.",
  "Invitation cannot be renewed for this user":
    "Для этого пользователя нельзя обновить ссылку приглашения.",
  "User not found": "Пользователь не найден.",
  "Policy or target not found": "Политика или пользователь не найдены.",
  "Valid email is required": "Укажите корректную электронную почту.",
  "At least one email is required": "Укажите хотя бы одну электронную почту.",
  "Too many emails in a single batch":
    "Слишком много адресов за один раз (максимум 200).",
  "Invalid policy id": "Некорректная политика.",
  "Invalid policy name": "Некорректное название политики.",
  "Policy name is required": "Укажите название политики.",
  "Access denied": "Недостаточно прав для выполнения этого действия.",
};

export function parseInviteEmailList(raw: string): string[] {
  return raw
    .split(/[\r\n,;]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function localizeAccessError(message: string): string {
  const trimmed = message.trim();
  return ACCESS_ERROR_TRANSLATIONS[trimmed] ?? message;
}

export function resolveCollectionFieldLabel(
  fieldName: string,
  collection?: PolicyCollection,
): string {
  if (fieldName === "*") {
    return "Все поля";
  }
  if (fieldName === "created_at") {
    return "Дата создания";
  }
  if (fieldName === "updated_at") {
    return "Дата изменения";
  }
  if (collection && fieldName === collection.primaryKey.name) {
    return "ID";
  }
  const field = collection?.fields.find((entry) => entry.name === fieldName);
  return field?.presentation?.label || fieldName;
}

export function excludedPermissionFields(
  permission: Pick<EffectivePermission, "action" | "fields">,
  collection?: PolicyCollection,
): { name: string; label: string }[] {
  if (
    !collection ||
    permission.action === "delete" ||
    permission.fields.includes("*")
  ) {
    return [];
  }
  const allowed = new Set(permission.fields);
  return collection.fields
    .filter(
      (field) =>
        (permission.action === "read" || field.type !== "alias") &&
        !allowed.has(field.name),
    )
    .map((field) => ({
      name: field.name,
      label: field.presentation?.label || field.name,
    }));
}

export function delegatingPolicyIdsFromPermissions(
  permissions: Permission[],
): string[] {
  const ids = new Set<string>();
  for (const permission of permissions) {
    if (
      "section" in permission &&
      permission.action === "update" &&
      (permission.section === "policies" || permission.section === "users")
    ) {
      for (const policyId of permission.policyIds) {
        ids.add(policyId);
      }
    }
  }
  return [...ids];
}
