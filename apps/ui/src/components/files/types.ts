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
export function fileSize(bytes: number) {
  return bytes < 1024
    ? `${bytes} Б`
    : bytes < 1024 * 1024
      ? `${(bytes / 1024).toFixed(1)} КБ`
      : `${(bytes / (1024 * 1024)).toFixed(1)} МБ`;
}
