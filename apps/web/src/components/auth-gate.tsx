import * as React from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { Button, Card, CardContent, Input, Label } from "@tmdb-see/ui";
import { api, errorText } from "@/lib/api";
import {
  AUTH_CHANGED_EVENT,
  AUTH_INVALID_EVENT,
  clearApiKey,
  getApiKey,
  setApiKey,
} from "@/lib/auth";
import { BrandMark } from "./brand";

type AuthState = "checking" | "anonymous" | "authenticated";

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Checking your session…
      </div>
    </div>
  );
}

function LoginScreen({ onAuthenticated }: { onAuthenticated: () => void }) {
  const [value, setValue] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const key = value.trim();
    if (!key) {
      setError("Enter the API key from the See server logs.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.verifyKey(key);
      setApiKey(key);
      setValue("");
      onAuthenticated();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex items-center gap-3">
          <BrandMark />
          <div>
            <div className="text-lg font-semibold leading-tight tracking-tight">See</div>
            <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
              TMDB download hub
            </div>
          </div>
        </div>
        <Card className="border-border/70 bg-card/60 backdrop-blur">
          <CardContent className="p-5">
            <div className="mb-4 flex items-center gap-2">
              <span className="flex size-8 items-center justify-center rounded-lg border border-primary/25 bg-primary/10 text-primary">
                <KeyRound className="size-4" />
              </span>
              <div>
                <h1 className="text-sm font-semibold">See - Login</h1>
                <p className="text-[11px] text-muted-foreground">Unlock the dashboard and widget.</p>
              </div>
            </div>
            <form onSubmit={(event) => void submit(event)} className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="api-key" className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">
                  API key
                </Label>
                <Input
                  id="api-key"
                  type="password"
                  autoComplete="current-password"
                  spellCheck={false}
                  autoFocus
                  placeholder="Paste your API key"
                  className="font-mono"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                />
              </div>
              {error && (
                <p className="rounded-md border border-red-400/30 bg-red-400/10 px-2.5 py-2 text-[11px] text-red-200">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full" disabled={busy}>
                {busy ? <Loader2 className="animate-spin" /> : <KeyRound />}
                Sign in
              </Button>
            </form>
            <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
              The key is printed in the See server logs on every start:
              <code className="mt-1 block rounded bg-background/60 px-2 py-1 font-mono text-[10px]">
                See API key: &lt;key&gt;
              </code>
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<AuthState>("checking");

  const check = React.useCallback(() => {
    const key = getApiKey();
    if (!key) {
      setState("anonymous");
      return;
    }
    setState("checking");
    api
      .session()
      .then(() => setState("authenticated"))
      .catch(() => {
        clearApiKey();
        setState("anonymous");
      });
  }, []);

  React.useEffect(() => {
    check();
    const invalid = () => {
      clearApiKey();
      setState("anonymous");
    };
    window.addEventListener(AUTH_INVALID_EVENT, invalid);
    window.addEventListener(AUTH_CHANGED_EVENT, check);
    return () => {
      window.removeEventListener(AUTH_INVALID_EVENT, invalid);
      window.removeEventListener(AUTH_CHANGED_EVENT, check);
    };
  }, [check]);

  if (state === "checking") return <Splash />;
  if (state === "anonymous") return <LoginScreen onAuthenticated={() => setState("authenticated")} />;
  return <>{children}</>;
}
