import { Badge, cn } from "@tmdb-see/ui";

export function QualityBadge({ quality, className }: { quality?: string | null; className?: string }) {
  if (!quality) return null;
  const variant =
    quality === "2160p"
      ? "violet"
      : quality === "1080p"
        ? "sky"
        : quality === "720p"
          ? "warning"
          : quality === "Auto"
            ? "default"
            : "muted";
  return (
    <Badge variant={variant} className={cn("font-mono text-[10px] tracking-wide", className)}>
      {quality}
    </Badge>
  );
}
