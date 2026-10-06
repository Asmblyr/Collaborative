import { originalCopy, type UiCopy } from "@/lib/ui-copy-types";
export interface StoredFile {
  id: string;
  filename: string;
  title: string;
  description: string;
  mimeType: string;
  size: number;
  sha256: string;
  status: "uploading" | "ready" | "failed" | "deleting";
  previewable: boolean;
  visibility?: "private" | "public";
  uploadedBy: string;
  createdAt: string;
  updatedAt: string;
}
export interface FilePage {
  data: StoredFile[];
  meta: {
    page: number;
    limit: number;
    total: number;
    storageConfigured: boolean;
    canManage: boolean;
    maxFileBytes: number;
  };
}
export const fileStatus = {
  uploading: "Загружается",
  ready: "Готов",
  failed: "Ошибка загрузки",
  deleting: "Удаляется",
};
export function fileSize(bytes: number, copy: UiCopy = originalCopy) {
  return bytes < 1024
    ? copy("{{value0}} Б", { value0: bytes })
    : bytes < 1024 * 1024
      ? copy("{{value0}} КБ", { value0: (bytes / 1024).toFixed(1) })
      : copy("{{value0}} МБ", { value0: (bytes / (1024 * 1024)).toFixed(1) });
}
