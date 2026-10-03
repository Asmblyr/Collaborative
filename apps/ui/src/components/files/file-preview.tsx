import Image from "next/image";
import { FileText } from "lucide-react";
import type { StoredFile } from "./types";

export function FilePreview({
  file,
  compact = false,
}: {
  file: StoredFile;
  compact?: boolean;
}) {
  return (
    <div
      className={
        compact
          ? "relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-muted"
          : "relative flex h-60 items-center justify-center overflow-hidden rounded-xl border bg-muted/40"
      }
    >
      {file.previewable && file.status === "ready" ? (
        <Image
          src={`/api/files/${file.id}/content?preview=1`}
          alt={compact ? "" : file.title}
          fill
          unoptimized
          className={compact ? "object-cover" : "object-contain p-3"}
        />
      ) : (
        <FileText
          aria-hidden
          className={
            compact
              ? "size-5 text-muted-foreground"
              : "size-14 text-muted-foreground/50"
          }
        />
      )}
    </div>
  );
}
