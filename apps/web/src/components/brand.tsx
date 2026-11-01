import { Link } from "react-router-dom";
import { cn } from "@tmdb-see/ui";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "relative flex size-9 items-center justify-center overflow-hidden rounded-xl border border-emerald-300/25 bg-gradient-to-br from-emerald-300 to-teal-600 text-emerald-950 shadow-[0_8px_24px_-8px_rgba(52,211,153,0.65)]",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none">
        <path
          d="M4.6 12.4C6.5 8.9 9.3 7 12.8 7c3.4 0 6.1 1.7 7.8 4.8-1.7 3.5-4.4 5.2-7.8 5.2-3.4 0-6.2-1.6-8.2-4.6Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
        <circle cx="12.8" cy="11.9" r="2.1" fill="currentColor" />
      </svg>
    </span>
  );
}

export function Brand({
  compact = false,
  className,
}: {
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link to="/" className={cn("flex items-center gap-2.5", className)}>
      <BrandMark />
      {!compact && (
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold leading-tight tracking-tight">See</span>
          <span className="block truncate text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
            TMDB download hub
          </span>
        </span>
      )}
    </Link>
  );
}
