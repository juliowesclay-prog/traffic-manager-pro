import { Film } from "lucide-react";
import { cn } from "@tmp/ui";

export const fileUrl = (id: string, download = false) =>
  `/api/v1/admin/marketing/arquivos/${id}${download ? "?baixar=1" : ""}`;

/** Prévia de um arquivo do Marketing (imagem ou vídeo), servida pelo servidor com login. */
export function MediaPreview({
  asset,
  alt,
  className,
  controls = false,
}: {
  asset: { id: string; kind: "IMAGEM" | "VIDEO"; width: number | null; height: number | null } | null;
  alt: string;
  className?: string;
  controls?: boolean;
}) {
  if (!asset)
    return <div className={cn("grid place-items-center bg-canvas text-sm text-ink-soft", className)}>Sem arquivo</div>;
  if (asset.kind === "VIDEO") {
    if (!controls)
      return (
        <div className={cn("grid place-items-center bg-navy text-white", className)}>
          <Film aria-hidden="true" className="size-8 opacity-80" />
          <span className="sr-only">{alt}</span>
        </div>
      );
    return (
      <video
        src={fileUrl(asset.id)}
        controls
        preload="metadata"
        playsInline
        className={cn("bg-black", className)}
        aria-label={alt}
      />
    );
  }
  return (
    <img
      src={fileUrl(asset.id)}
      alt={alt}
      width={asset.width ?? undefined}
      height={asset.height ?? undefined}
      loading="lazy"
      className={cn("bg-canvas object-contain", className)}
    />
  );
}
