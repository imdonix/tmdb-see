import type { FollowItemStatus, MovieDownloadStatus } from "@tmdb-see/shared";
import { Badge } from "@tmdb-see/ui";

const FOLLOW_VARIANTS: Record<
  FollowItemStatus,
  { label: string; variant: "default" | "secondary" | "success" | "warning" | "danger" | "muted" | "outline" | "sky" }
> = {
  wanted: { label: "wanted", variant: "outline" },
  found: { label: "found", variant: "warning" },
  downloading: { label: "downloading", variant: "sky" },
  completed: { label: "completed", variant: "success" },
  failed: { label: "failed", variant: "danger" },
  cannot_find: { label: "cannot find", variant: "danger" },
  skipped: { label: "skipped", variant: "muted" },
  missing: { label: "missing", variant: "warning" },
};

export function FollowStatusBadge({ status }: { status: FollowItemStatus }) {
  const config = FOLLOW_VARIANTS[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

export function MovieStatusBadge({ status }: { status: MovieDownloadStatus }) {
  const map = {
    downloading: { label: "downloading", variant: "sky" as const },
    completed: { label: "ready", variant: "success" as const },
    missing: { label: "missing", variant: "warning" as const },
    failed: { label: "failed", variant: "danger" as const },
  } satisfies Record<MovieDownloadStatus, { label: string; variant: "sky" | "success" | "warning" | "danger" }>;
  const config = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
