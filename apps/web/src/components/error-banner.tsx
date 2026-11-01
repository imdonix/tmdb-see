import { AlertTriangle, X } from "lucide-react";
import { cn } from "@tmdb-see/ui";

export function ErrorBanner({
  message,
  onDismiss,
  className,
}: {
  message?: string | null;
  onDismiss?: () => void;
  className?: string;
}) {
  if (!message) return null;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg border border-red-400/30 bg-red-400/8 px-4 py-3 text-sm text-red-700 dark:text-red-200",
        className,
      )}
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-red-600 dark:text-red-300" />
      <div className="min-w-0 flex-1 break-words">{message}</div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="cursor-pointer rounded-sm text-red-600/70 transition hover:text-red-800 dark:text-red-200/70 dark:hover:text-red-100"
          aria-label="Dismiss error"
        >
          <X className="size-4" />
        </button>
      )}
    </div>
  );
}
