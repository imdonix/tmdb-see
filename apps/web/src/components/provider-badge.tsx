import type { ProviderKind } from "@tmdb-see/shared";
import { Badge, cn } from "@tmdb-see/ui";
import { RadioTower, Server } from "lucide-react";

export function ProviderBadge({
  name,
  kind,
  className,
  showIcon = true,
}: {
  name: string;
  kind: ProviderKind;
  className?: string;
  showIcon?: boolean;
}) {
  return (
    <Badge
      variant={kind === "ncore" ? "success" : "sky"}
      className={cn("gap-1.5 font-semibold", className)}
    >
      {showIcon && (kind === "ncore" ? <Server /> : <RadioTower />)}
      {name}
    </Badge>
  );
}
