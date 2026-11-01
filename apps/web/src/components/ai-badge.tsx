import type { AiMatch } from "@tmdb-see/shared";
import { Badge, Tooltip, TooltipContent, TooltipTrigger } from "@tmdb-see/ui";
import { Bot, CheckCheck, ShieldQuestion } from "lucide-react";

export function AiBadge({ match, className }: { match?: AiMatch | null; className?: string }) {
  if (!match) return null;
  const percent = Math.round(match.confidence * 100);
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge
          variant={match.verified ? "success" : "danger"}
          className={className}
        >
          {match.verified ? <CheckCheck /> : <ShieldQuestion />}
          AI {percent}%
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 font-medium">
            <Bot className="size-3" />
            {match.verified ? "AI confirmed this release" : "AI rejected this release"}
          </div>
          <p className="text-muted-foreground">{match.reason || "No reason supplied."}</p>
          {match.model && <p className="text-[10px] text-muted-foreground/70">{match.model}</p>}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
