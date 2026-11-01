import { Toaster } from "sonner";
import { useTheme } from "./theme-provider";

export function AppToaster() {
  const { theme } = useTheme();
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      richColors
      closeButton
      toastOptions={{
        style: {
          borderRadius: "0.75rem",
          border: "1px solid color-mix(in oklab, var(--border) 80%, transparent)",
          background: "var(--card)",
          color: "var(--card-foreground)",
        },
      }}
    />
  );
}
