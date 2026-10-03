import { Pencil, Trash2, X } from "lucide-react";
import { Button } from "@asmblyr/kit/ui/button";

export function ItemSelectionBar({
  count,
  confirming,
  pending,
  canDelete,
  disabled,
  onDelete,
  onConfirm,
  onCancel,
  onClear,
  onEdit,
  canEdit,
}: {
  count: number;
  confirming: boolean;
  pending: boolean;
  canDelete: boolean;
  disabled: boolean;
  canEdit: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onConfirm: () => void;
  onCancel: () => void;
  onClear: () => void;
}) {
  if (!count) return null;
  return (
    <div
      role="group"
      aria-label="Действия с выбранными записями"
      className="fixed bottom-[calc(3rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[calc(100vw-2rem)] max-w-xl -translate-x-1/2 flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card/95 px-4 py-3 text-sm shadow-[0_0_24px_rgb(0_0_0/0.12),0_4px_12px_rgb(0_0_0/0.08)] backdrop-blur-md sm:bottom-14 dark:shadow-[0_0_24px_rgb(0_0_0/0.5),0_0_0_1px_rgb(255_255_255/0.06)]"
    >
      <div className="flex items-center gap-2 font-medium">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted tabular-nums">
          {count}
        </span>
        <span>
          {confirming ? "Удалить выбранные записи?" : "Выбрано на странице"}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {canEdit && !confirming && (
          <Button
            size="sm"
            variant="outline"
            disabled={pending || disabled}
            onClick={onEdit}
          >
            <Pencil />
            Изменить
          </Button>
        )}
        {canDelete &&
          (confirming ? (
            <>
              <Button
                size="sm"
                variant="destructive"
                disabled={pending}
                onClick={onDelete}
              >
                Да, удалить
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={onCancel}
              >
                Отмена
              </Button>
            </>
          ) : (
            <Button
              size="sm"
              variant="destructive"
              disabled={pending || disabled}
              onClick={onConfirm}
            >
              <Trash2 aria-hidden="true" /> Удалить
            </Button>
          ))}
        {!confirming && (
          <Button
            size="icon-sm"
            variant="ghost"
            disabled={pending}
            onClick={onClear}
            aria-label="Снять выделение"
          >
            <X aria-hidden="true" />
          </Button>
        )}
      </div>
    </div>
  );
}
