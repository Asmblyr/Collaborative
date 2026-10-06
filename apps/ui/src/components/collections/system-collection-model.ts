import type {
  SystemCollection,
  SystemCollectionName,
} from "@asmblyr-collaborative/contracts";
import type { Collection } from "@/components/items/types";

export const systemCollectionLabels: Record<SystemCollectionName, string> = {
  users: "Пользователи",
  files: "Файлы",
  policies: "Политики доступа",
  workspaces: "Рабочие пространства",
  service_accounts: "Сервисные аккаунты",
};

export function systemCollectionModel(
  collection: SystemCollection,
  label: string,
): Collection {
  return {
    ...collection,
    system: true,
    displayName: label,
    folderId: null,
    mode: "multiple",
    primaryKey: { name: "id", type: "uuid" },
    timestamps: { createdAt: false, updatedAt: false },
    access: {
      create: null,
      read: ["*"],
      update: ["*"],
      delete: false,
      structure: true,
    },
  };
}
