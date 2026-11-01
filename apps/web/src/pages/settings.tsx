import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  Check,
  Clock,
  Database,
  Loader2,
  Pencil,
  Plug,
  Plus,
  RadioTower,
  RefreshCw,
  Save,
  Server,
  ShieldCheck,
  Trash2,
  Zap,
} from "lucide-react";
import type { ProviderAdminView, ProviderKind, ProviderWrite, SeriesQuality } from "@tmdb-see/shared";
import { formatRelative } from "@tmdb-see/shared";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Skeleton,
  Switch,
  cn,
} from "@tmdb-see/ui";
import { toast } from "sonner";
import { api, errorText } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { ErrorBanner } from "@/components/error-banner";

function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-[10px] leading-relaxed text-muted-foreground/80">{hint}</p>}
    </div>
  );
}

function SaveBar({ pending, onClick, label = "Save changes" }: { pending: boolean; onClick: () => void; label?: string }) {
  return (
    <div className="flex justify-end pt-1">
      <Button onClick={onClick} disabled={pending}>
        {pending ? <Loader2 className="animate-spin" /> : <Save />} {label}
      </Button>
    </div>
  );
}

function SettingsGroup({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary/80">{title}</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {children}
    </section>
  );
}

interface ProviderForm {
  id?: string;
  name: string;
  kind: ProviderKind;
  enabled: boolean;
  priority: number;
  baseUrl: string;
  username: string;
  password: string;
  apiKey: string;
  allowExternalDownloads: boolean;
}

const EMPTY_PROVIDER: ProviderForm = {
  name: "",
  kind: "ncore",
  enabled: true,
  priority: 100,
  baseUrl: "",
  username: "",
  password: "",
  apiKey: "",
  allowExternalDownloads: false,
};

export function SettingsPage() {
  const queryClient = useQueryClient();
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: api.settings });
  const providersQuery = useQuery({
    queryKey: ["admin-providers"],
    queryFn: api.adminProviders,
    staleTime: 15_000,
  });
  const settings = settingsQuery.data;
  const providers = providersQuery.data?.providers ?? [];

  const [general, setGeneral] = React.useState({
    followIntervalMinutes: 60,
    defaultQuality: "1080p" as SeriesQuality,
    searchPageSize: 40,
  });
  const [ai, setAi] = React.useState({
    enabled: false,
    baseUrl: "https://ollama.com",
    model: "gpt-oss:120b",
    apiKey: "",
    verifyDownloads: false,
    verifyFollows: false,
    threshold: 0.75,
  });
  const [connections, setConnections] = React.useState({
    tmdbApiKey: "",
    tmdbLanguage: "en-US",
    qbitHost: "",
    qbitUsername: "",
    qbitPassword: "",
    qbitSavePath: "",
    qbitOrganize: true,
  });
  const hydratedSettings = React.useRef(false);

  React.useEffect(() => {
    if (!settings || hydratedSettings.current) return;
    hydratedSettings.current = true;
    setGeneral({ ...settings.app });
    setAi({
      enabled: settings.ai.enabled,
      baseUrl: settings.ai.baseUrl,
      model: settings.ai.model,
      apiKey: "",
      verifyDownloads: settings.ai.verifyDownloads,
      verifyFollows: settings.ai.verifyFollows,
      threshold: settings.ai.threshold,
    });
    setConnections({
      tmdbApiKey: "",
      tmdbLanguage: settings.tmdb.language,
      qbitHost: settings.qbit.host,
      qbitUsername: settings.qbit.username,
      qbitPassword: "",
      qbitSavePath: settings.qbit.savePath,
      qbitOrganize: settings.qbit.organize,
    });
  }, [settings]);

  const [providerOpen, setProviderOpen] = React.useState(false);
  const [providerForm, setProviderForm] = React.useState<ProviderForm>(EMPTY_PROVIDER);
  const [wizardStep, setWizardStep] = React.useState(0);
  const [providerError, setProviderError] = React.useState("");
  const [testAfterAdd, setTestAfterAdd] = React.useState(true);

  const invalidateSettings = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["settings"] }),
      queryClient.invalidateQueries({ queryKey: ["providers"] }),
      queryClient.invalidateQueries({ queryKey: ["overview"] }),
    ]);
  };

  const invalidateProviders = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-providers"] }),
      queryClient.invalidateQueries({ queryKey: ["providers"] }),
      queryClient.invalidateQueries({ queryKey: ["overview"] }),
    ]);
  };

  const saveGeneral = useMutation({
    mutationFn: () => api.updateSettings({ app: general }),
    onSuccess: async () => {
      await invalidateSettings();
      toast.success("General settings saved");
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const saveAi = useMutation({
    mutationFn: () =>
      api.updateSettings({
        ai: {
          enabled: ai.enabled,
          baseUrl: ai.baseUrl,
          model: ai.model,
          verifyDownloads: ai.verifyDownloads,
          verifyFollows: ai.verifyFollows,
          threshold: ai.threshold,
          ...(ai.apiKey ? { apiKey: ai.apiKey } : {}),
        },
      }),
    onSuccess: async () => {
      await invalidateSettings();
      setAi((current) => ({ ...current, apiKey: "" }));
      toast.success("AI settings saved");
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const saveTmdb = useMutation({
    mutationFn: () =>
      api.updateSettings({
        tmdb: {
          language: connections.tmdbLanguage,
          ...(connections.tmdbApiKey ? { apiKey: connections.tmdbApiKey } : {}),
        },
      }),
    onSuccess: async () => {
      await invalidateSettings();
      setConnections((current) => ({ ...current, tmdbApiKey: "" }));
      toast.success("TMDB settings saved");
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const saveQbit = useMutation({
    mutationFn: () =>
      api.updateSettings({
        qbit: {
          host: connections.qbitHost,
          username: connections.qbitUsername,
          savePath: connections.qbitSavePath,
          organize: connections.qbitOrganize,
          ...(connections.qbitPassword ? { password: connections.qbitPassword } : {}),
        },
      }),
    onSuccess: async () => {
      await invalidateSettings();
      setConnections((current) => ({ ...current, qbitPassword: "" }));
      toast.success("qBittorrent settings saved");
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const testQbit = useMutation({
    mutationFn: () =>
      api.testQbit({
        host: connections.qbitHost,
        username: connections.qbitUsername,
        ...(connections.qbitPassword ? { password: connections.qbitPassword } : {}),
      }),
    onSuccess: (result) =>
      result.health.ok ? toast.success(result.health.message) : toast.error(result.health.message),
    onError: (error) => toast.error(errorText(error)),
  });

  const testTmdb = useMutation({
    mutationFn: api.testTmdb,
    onSuccess: (result) =>
      result.health.ok ? toast.success(result.health.message) : toast.error(result.health.message),
    onError: (error) => toast.error(errorText(error)),
  });

  const testAi = useMutation({
    mutationFn: () =>
      api.testAi({
        baseUrl: ai.baseUrl,
        model: ai.model,
        ...(ai.apiKey ? { apiKey: ai.apiKey } : {}),
      }),
    onSuccess: (result) =>
      result.health.ok ? toast.success(result.health.message) : toast.error(result.health.message),
    onError: (error) => toast.error(errorText(error)),
  });

  const createProvider = useMutation({
    mutationFn: (input: ProviderWrite) => api.createProvider(input),
    onSuccess: async (result) => {
      await invalidateProviders();
      setProviderOpen(false);
      setWizardStep(0);
      setProviderError("");
      toast.success("Provider added");
      if (testAfterAdd) {
        const toastId = toast.loading("Testing provider connection…");
        try {
          const health = await api.testProvider(result.provider.id);
          if (health.health.ok) toast.success(health.health.message, { id: toastId });
          else toast.error(health.health.message, { id: toastId });
          await invalidateProviders();
        } catch (error) {
          toast.error(errorText(error), { id: toastId });
        }
      }
    },
    onError: (error) => {
      const message = errorText(error);
      setProviderError(message);
      setWizardStep(1);
      toast.error(message);
    },
  });

  const updateProvider = useMutation({
    mutationFn: (input: { id: string; patch: Partial<ProviderWrite> }) =>
      api.updateProvider(input.id, input.patch),
    onSuccess: async () => {
      await invalidateProviders();
      setProviderOpen(false);
      toast.success("Provider updated");
    },
    onError: (error) => {
      setProviderError(errorText(error));
      toast.error(errorText(error));
    },
  });

  const deleteProvider = useMutation({
    mutationFn: (id: string) => api.deleteProvider(id),
    onSuccess: async () => {
      await invalidateProviders();
      toast.success("Provider deleted");
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const testProvider = useMutation({
    mutationFn: (id: string) => api.testProvider(id),
    onSuccess: async (result) => {
      if (result.health.ok) toast.success(result.health.message);
      else toast.error(result.health.message);
      await invalidateProviders();
    },
    onError: (error) => toast.error(errorText(error)),
  });

  const toggleProvider = (provider: ProviderAdminView, enabled: boolean) => {
    updateProvider.mutate({ id: provider.id, patch: { enabled } });
  };

  const openAdd = () => {
    setProviderForm({ ...EMPTY_PROVIDER });
    setWizardStep(0);
    setProviderError("");
    setTestAfterAdd(true);
    setProviderOpen(true);
  };

  const chooseProviderKind = (kind: ProviderKind) => {
    setProviderForm({
      ...EMPTY_PROVIDER,
      kind,
      name: kind === "ncore" ? "nCore" : "Prowlarr",
      baseUrl: kind === "ncore" ? "http://ncore:8080" : "",
      priority: kind === "ncore" ? 10 : 50,
    });
    setProviderError("");
    setWizardStep(1);
  };

  const validateProviderForm = (form: ProviderForm): string => {
    if (!form.name.trim()) return "Give this provider a name.";
    if (!form.baseUrl.trim()) return "A base URL is required.";
    try {
      const url = new URL(form.baseUrl.trim());
      if (!["http:", "https:"].includes(url.protocol)) {
        return "The base URL must use http or https.";
      }
    } catch {
      return "The base URL is not a valid URL.";
    }
    if (form.kind === "ncore" && !form.username.trim()) {
      return "An nCore username is required.";
    }
    if (form.kind === "ncore" && !form.id && !form.password) {
      return "An nCore password is required.";
    }
    return "";
  };

  const continueWizard = () => {
    const error = validateProviderForm(providerForm);
    if (error) {
      setProviderError(error);
      return;
    }
    setProviderError("");
    setWizardStep(2);
  };

  const openEdit = (provider: ProviderAdminView) => {
    const config = provider.config;
    setProviderForm({
      id: provider.id,
      name: provider.name,
      kind: provider.kind,
      enabled: provider.enabled,
      priority: provider.priority,
      baseUrl: String(config.baseUrl ?? ""),
      username: String(config.username ?? ""),
      password: "",
      apiKey: "",
      allowExternalDownloads: Boolean(config.allowExternalDownloads),
    });
    setProviderError("");
    setWizardStep(1);
    setProviderOpen(true);
  };

  const submitProvider = () => {
    const error = validateProviderForm(providerForm);
    if (error) {
      setProviderError(error);
      if (!providerForm.id) setWizardStep(1);
      return;
    }
    setProviderError("");

    const name = providerForm.name.trim();
    const baseUrl = providerForm.baseUrl.trim();
    const config =
      providerForm.kind === "ncore"
        ? {
            baseUrl,
            username: providerForm.username.trim(),
            password: providerForm.password,
          }
        : {
            baseUrl,
            apiKey: providerForm.apiKey.trim(),
            allowExternalDownloads: providerForm.allowExternalDownloads,
          };
    if (providerForm.id) {
      updateProvider.mutate({
        id: providerForm.id,
        patch: {
          name,
          enabled: providerForm.enabled,
          priority: providerForm.priority,
          config,
        },
      });
    } else {
      createProvider.mutate({
        name,
        kind: providerForm.kind,
        enabled: providerForm.enabled,
        priority: providerForm.priority,
        config,
      });
    }
  };

  if (settingsQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const qbitBasePreview = connections.qbitSavePath
    .trim()
    .replace(/\/+$/, "");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Configuration"
        title="Settings"
        description="Providers, AI verification, qBittorrent, and TMDB. Credentials are encrypted in the local SQLite database."
      />

      {settingsQuery.error && <ErrorBanner message={errorText(settingsQuery.error)} />}
      {providersQuery.error && <ErrorBanner message={errorText(providersQuery.error)} />}

      <div className="space-y-9">
        <SettingsGroup
          title="Providers"
          description="Torrent engines used for search, direct downloads, and follow checks. nCore is the default; Torznab adds Prowlarr, Jackett, or any compatible indexer."
        >
          <Card>
            <CardHeader className="flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Server className="size-4 text-primary" /> Torrent providers
                </CardTitle>
                <CardDescription>
                  Searches run across every enabled provider in parallel. nCore is the default; Torznab adds
                  Prowlarr, Jackett, or any compatible indexer.
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={openAdd}>
                  <Plus /> Add provider
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {providersQuery.isLoading ? (
                <Skeleton className="h-28 rounded-xl" />
              ) : providers.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border/70 px-4 py-10 text-center text-sm text-muted-foreground">
                  No providers configured. Add nCore or a Torznab endpoint.
                </div>
              ) : (
                providers.map((provider) => (
                  <div
                    key={provider.id}
                    className={cn(
                      "rounded-xl border p-4 transition",
                      provider.enabled ? "border-border/70 bg-muted/10" : "border-border/50 bg-muted/5 opacity-70",
                    )}
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-sm font-semibold">{provider.name}</h3>
                          <Badge variant={provider.kind === "ncore" ? "success" : "sky"}>
                            {provider.kind}
                          </Badge>
                          <Badge variant="outline">priority {provider.priority}</Badge>
                          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                            <span
                              className={cn(
                                "size-1.5 rounded-full",
                                provider.health?.ok
                                  ? "bg-emerald-400"
                                  : provider.health
                                    ? "bg-red-400"
                                    : "bg-muted-foreground/40",
                              )}
                            />
                            {provider.health
                              ? provider.health.ok
                                ? `${provider.health.latencyMs ?? 0}ms · ${formatRelative(provider.health.checkedAt)}`
                                : provider.health.message
                              : "not checked"}
                          </span>
                        </div>
                        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
                          {String(provider.config.baseUrl ?? "—")}
                        </p>
                        <p className="mt-1 text-[10px] text-muted-foreground">
                          {provider.categories.length} categories ·{" "}
                          {provider.kind === "ncore"
                            ? provider.config.hasPassword
                              ? "credentials saved"
                              : "password missing"
                            : provider.config.hasApiKey
                              ? "API key saved"
                              : "no API key"}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                        <div className="mr-1 flex items-center gap-1.5">
                          <Switch
                            checked={provider.enabled}
                            onCheckedChange={(enabled) => toggleProvider(provider, enabled)}
                            aria-label="Enable provider"
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => testProvider.mutate(provider.id)}
                          disabled={testProvider.isPending}
                        >
                          {testProvider.isPending && testProvider.variables === provider.id ? (
                            <Loader2 className="animate-spin" />
                          ) : (
                            <Zap />
                          )}
                          Test
                        </Button>
                        <Button variant="outline" size="sm" onClick={() => openEdit(provider)}>
                          <Pencil /> Edit
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              className="text-red-600 hover:bg-red-400/10 dark:text-red-300"
                              title="Delete provider"
                            >
                              <Trash2 />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete {provider.name}?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Existing torrents and followed series stay put, but this provider can no longer be
                                searched.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                className="bg-red-500 text-white hover:bg-red-500/90"
                                onClick={() => deleteProvider.mutate(provider.id)}
                              >
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
          <div className="flex items-start gap-2 rounded-lg border border-border/60 bg-muted/15 px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
            <Database className="mt-0.5 size-3.5 shrink-0" />
            Provider credentials are encrypted with AES-256-GCM. Set a stable <code className="font-mono">APP_SECRET</code>{" "}
            environment variable to keep the encryption key across fresh volumes.
          </div>
        </SettingsGroup>

        <SettingsGroup
          title="AI"
          description="Optional second opinion from Ollama before releases are sent to qBittorrent."
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Bot className="size-4 text-primary" /> Ollama verification
              </CardTitle>
              <CardDescription>
                A strict second opinion before a release is marked as the right film or episode. Works with Ollama
                Cloud and self-hosted Ollama.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/15 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">Enable AI verification</div>
                  <div className="text-[11px] text-muted-foreground">
                    Turns on the verifier, badges, and the rules below.
                  </div>
                </div>
                <Switch checked={ai.enabled} onCheckedChange={(enabled) => setAi({ ...ai, enabled })} />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Ollama base URL" hint="Use https://ollama.com for Ollama Cloud, or your self-hosted URL.">
                  <Input
                    value={ai.baseUrl}
                    onChange={(event) => setAi({ ...ai, baseUrl: event.target.value })}
                    placeholder="https://ollama.com"
                  />
                </Field>
                <Field label="Model" hint="For example gpt-oss:120b, qwen3:32b, or another tool-capable model.">
                  <Input
                    value={ai.model}
                    onChange={(event) => setAi({ ...ai, model: event.target.value })}
                    placeholder="gpt-oss:120b"
                  />
                </Field>
              </div>
              <Field label="API key" hint={settings?.ai.hasApiKey ? "A key is already saved. Leave blank to keep it." : "Required for Ollama Cloud."}>
                <Input
                  type="password"
                  value={ai.apiKey}
                  onChange={(event) => setAi({ ...ai, apiKey: event.target.value })}
                  placeholder={settings?.ai.hasApiKey ? "•••••••• (saved)" : "ollama_…"}
                  autoComplete="off"
                />
              </Field>
              <Separator />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/15 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">Verify movie downloads</div>
                    <div className="text-[11px] text-muted-foreground">Filter releases in the movie widget.</div>
                  </div>
                  <Switch
                    checked={ai.verifyDownloads}
                    onCheckedChange={(verifyDownloads) => setAi({ ...ai, verifyDownloads })}
                  />
                </div>
                <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 bg-muted/15 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">Verify series checks</div>
                    <div className="text-[11px] text-muted-foreground">Reject wrong shows before grabbing.</div>
                  </div>
                  <Switch
                    checked={ai.verifyFollows}
                    onCheckedChange={(verifyFollows) => setAi({ ...ai, verifyFollows })}
                  />
                </div>
              </div>
              <Field
                label="Match threshold"
                hint="A release must reach this confidence to pass automatic verification. 0.75 is a good starting point."
              >
                <div className="flex items-center gap-3">
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={ai.threshold}
                    onChange={(event) => setAi({ ...ai, threshold: Number(event.target.value) })}
                    className="w-28"
                  />
                  <span className="text-xs text-muted-foreground">{Math.round(ai.threshold * 100)}% confidence</span>
                </div>
              </Field>
              <div className="flex flex-wrap justify-between gap-2 pt-1">
                <Button variant="outline" onClick={() => testAi.mutate()} disabled={testAi.isPending}>
                  {testAi.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Test connection
                </Button>
                <Button onClick={() => saveAi.mutate()} disabled={saveAi.isPending}>
                  {saveAi.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save AI settings
                </Button>
              </div>
            </CardContent>
          </Card>
        </SettingsGroup>

        <SettingsGroup
          title="TMDB"
          description="The API key unlocks movie and series metadata for widgets and follows."
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-primary" /> API & metadata
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="API key" hint={settings?.tmdb.hasApiKey ? "A key is saved. Leave blank to keep it." : "Create one at themoviedb.org → Settings → API."}>
                <Input
                  type="password"
                  value={connections.tmdbApiKey}
                  onChange={(event) => setConnections({ ...connections, tmdbApiKey: event.target.value })}
                  placeholder={settings?.tmdb.hasApiKey ? "•••••••• (saved)" : "TMDB v3 API key"}
                  autoComplete="off"
                />
              </Field>
              <Field label="Language" hint="Used for titles, overviews, and season metadata.">
                <Input
                  value={connections.tmdbLanguage}
                  onChange={(event) => setConnections({ ...connections, tmdbLanguage: event.target.value })}
                  placeholder="en-US"
                />
              </Field>
              <div className="flex flex-wrap justify-between gap-2 pt-1">
                <Button variant="outline" onClick={() => testTmdb.mutate()} disabled={testTmdb.isPending}>
                  {testTmdb.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Test saved key
                </Button>
                <Button onClick={() => saveTmdb.mutate()} disabled={saveTmdb.isPending}>
                  {saveTmdb.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save TMDB
                </Button>
              </div>
            </CardContent>
          </Card>
        </SettingsGroup>

        <SettingsGroup
          title="qBittorrent"
          description="Download client used for scheduling, live progress, and Jellyfin-friendly folder layout."
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Plug className="size-4 text-primary" /> Web API & folder layout
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Web UI URL">
                  <Input
                    value={connections.qbitHost}
                    onChange={(event) => setConnections({ ...connections, qbitHost: event.target.value })}
                    placeholder="http://qbittorrent:8080"
                  />
                </Field>
                <Field label="Username">
                  <Input
                    value={connections.qbitUsername}
                    onChange={(event) => setConnections({ ...connections, qbitUsername: event.target.value })}
                    placeholder="admin"
                  />
                </Field>
              </div>
              <Field label="Password" hint={settings?.qbit.hasPassword ? "A password is saved. Leave blank to keep it." : undefined}>
                <Input
                  type="password"
                  value={connections.qbitPassword}
                  onChange={(event) => setConnections({ ...connections, qbitPassword: event.target.value })}
                  placeholder={settings?.qbit.hasPassword ? "•••••••• (saved)" : "adminadmin"}
                  autoComplete="off"
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label="Save path"
                  hint="Base path inside qBittorrent, e.g. /downloads. See creates Movies/ and TV Shows/ beneath it."
                >
                  <Input
                    value={connections.qbitSavePath}
                    onChange={(event) => setConnections({ ...connections, qbitSavePath: event.target.value })}
                    placeholder="/downloads"
                  />
                </Field>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/15 px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">Jellyfin folder layout</div>
                    <div className="text-[10px] text-muted-foreground">
                      Standard Movies/ and TV Shows/ roots with Name (Year) and Season 01 folders.
                    </div>
                  </div>
                  <Switch
                    checked={connections.qbitOrganize}
                    onCheckedChange={(qbitOrganize) => setConnections({ ...connections, qbitOrganize })}
                  />
                </div>
              </div>
              {connections.qbitOrganize && qbitBasePreview ? (
                <div className="rounded-lg border border-border/60 bg-background/40 p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                    Jellyfin path preview
                  </div>
                  <div className="mt-2 space-y-1 font-mono text-[10px] leading-relaxed text-muted-foreground">
                    <div>{qbitBasePreview}/Movies/Movie Name (Year)/</div>
                    <div>{qbitBasePreview}/TV Shows/Show Name (Year)/Season 01/</div>
                    <div>{qbitBasePreview}/TV Shows/Show Name (Year)/Season 01/Show Name (Year) S01E01/</div>
                  </div>
                  <div className="mt-2 text-[10px] text-muted-foreground/80">
                    Season packs are flattened into the season folder; single episodes use an episode folder to
                    avoid file collisions. Point Jellyfin’s Movies library at {qbitBasePreview}/Movies and Shows
                    library at {qbitBasePreview}/TV Shows.
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-amber-400/25 bg-amber-400/8 px-3 py-2 text-[10px] text-amber-700 dark:text-amber-200">
                  {connections.qbitOrganize
                    ? "Set a base save path (for example /downloads) to enable the Jellyfin folder structure."
                    : "Folder organization is disabled. qBittorrent’s own layout will be used, which may not be recognized reliably by Jellyfin."}
                </div>
              )}
              <div className="flex flex-wrap justify-between gap-2 pt-1">
                <Button variant="outline" onClick={() => testQbit.mutate()} disabled={testQbit.isPending}>
                  {testQbit.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />} Test qBittorrent
                </Button>
                <Button onClick={() => saveQbit.mutate()} disabled={saveQbit.isPending}>
                  {saveQbit.isPending ? <Loader2 className="animate-spin" /> : <Save />} Save qBittorrent
                </Button>
              </div>
            </CardContent>
          </Card>
        </SettingsGroup>

        <SettingsGroup
          title="General"
          description="Follow scanning cadence and search defaults."
        >
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="size-4 text-primary" /> Scheduling
              </CardTitle>
              <CardDescription>How often See scans providers for followed series.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Follow check interval" hint="Minutes between automatic checks. Minimum 5, maximum 1440.">
                  <Input
                    type="number"
                    min={5}
                    max={1440}
                    value={general.followIntervalMinutes}
                    onChange={(event) =>
                      setGeneral({ ...general, followIntervalMinutes: Number(event.target.value) })
                    }
                  />
                </Field>
                <Field label="Default series quality" hint="Used when a followed series does not specify one.">
                  <Select
                    value={general.defaultQuality}
                    onValueChange={(value) => setGeneral({ ...general, defaultQuality: value as SeriesQuality })}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="2160p">2160p</SelectItem>
                      <SelectItem value="1080p">1080p</SelectItem>
                      <SelectItem value="720p">720p</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Search page size" hint="Results requested from each provider per page (10–100).">
                  <Input
                    type="number"
                    min={10}
                    max={100}
                    value={general.searchPageSize}
                    onChange={(event) => setGeneral({ ...general, searchPageSize: Number(event.target.value) })}
                  />
                </Field>
              </div>
              <SaveBar pending={saveGeneral.isPending} onClick={() => saveGeneral.mutate()} />
            </CardContent>
          </Card>
        </SettingsGroup>
      </div>

      <Dialog
        open={providerOpen}
        onOpenChange={(open) => {
          setProviderOpen(open);
          if (!open) {
            setProviderError("");
            setWizardStep(0);
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto thin-scrollbar">
          <DialogHeader>
            <DialogTitle>
              {providerForm.id
                ? "Edit provider"
                : wizardStep === 0
                  ? "Add a torrent provider"
                  : wizardStep === 1
                    ? "Configure provider"
                    : "Review provider"}
            </DialogTitle>
            <DialogDescription>
              {providerForm.id
                ? "Update the connection details. Leave saved secrets blank to keep them."
                : wizardStep === 0
                  ? "Choose the type of backend you want to connect to See."
                  : wizardStep === 1
                    ? "Enter the connection details for this provider."
                    : "Confirm the details before adding the provider."}
            </DialogDescription>
          </DialogHeader>

          {!providerForm.id && (
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-[0.12em]">
              {["Choose type", "Details", "Review"].map((label, index) => {
                const current = wizardStep === index;
                const done = wizardStep > index;
                return (
                  <React.Fragment key={label}>
                    {index > 0 && <span className="h-px w-4 bg-border" />}
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5",
                        current ? "text-primary" : done ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-5 items-center justify-center rounded-full border text-[9px]",
                          current
                            ? "border-primary/50 bg-primary/10 text-primary"
                            : done
                              ? "border-primary/30 bg-primary/10 text-primary"
                              : "border-border bg-muted/20",
                        )}
                      >
                        {done ? <Check className="size-3" /> : index + 1}
                      </span>
                      {label}
                    </span>
                  </React.Fragment>
                );
              })}
            </div>
          )}

          {providerError && (
            <div className="rounded-lg border border-red-400/30 bg-red-400/8 px-3 py-2 text-xs text-red-700 dark:text-red-200">
              {providerError}
            </div>
          )}

          {!providerForm.id && wizardStep === 0 && (
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => chooseProviderKind("ncore")}
                className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-border/70 bg-muted/10 p-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex w-full items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg border border-emerald-400/20 bg-emerald-400/10 text-emerald-600 dark:text-emerald-300">
                    <Server className="size-4" />
                  </span>
                  <span className="text-sm font-semibold">nCore API</span>
                  <Badge variant="success" className="ml-auto">default</Badge>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Connect to an ncore-go compatible endpoint. Searches, downloads, follows, and hit-and-run data all
                  use the nCore token.
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  Use nCore <ArrowRight className="size-3.5" />
                </span>
              </button>

              <button
                type="button"
                onClick={() => chooseProviderKind("torznab")}
                className="group flex cursor-pointer flex-col gap-3 rounded-xl border border-border/70 bg-muted/10 p-4 text-left transition hover:border-primary/40 hover:bg-primary/5"
              >
                <div className="flex w-full items-center gap-2">
                  <span className="flex size-8 items-center justify-center rounded-lg border border-sky-400/20 bg-sky-400/10 text-sky-600 dark:text-sky-300">
                    <RadioTower className="size-4" />
                  </span>
                  <span className="text-sm font-semibold">Torznab</span>
                  <Badge variant="sky" className="ml-auto">multi-indexer</Badge>
                </div>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Add Prowlarr, Jackett, or any Torznab-compatible indexer. One provider can expose many trackers
                  behind the same API.
                </p>
                <span className="inline-flex items-center gap-1 text-xs font-medium text-primary">
                  Use Torznab <ArrowRight className="size-3.5" />
                </span>
              </button>
            </div>
          )}

          {(providerForm.id || wizardStep === 1) && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Name">
                  <Input
                    value={providerForm.name}
                    onChange={(event) => setProviderForm({ ...providerForm, name: event.target.value })}
                    placeholder={providerForm.kind === "ncore" ? "nCore" : "Prowlarr"}
                  />
                </Field>
                <Field label="Provider type">
                  <div className="flex h-9 items-center gap-2 rounded-md border border-input bg-muted/20 px-3">
                    {providerForm.kind === "ncore" ? (
                      <Server className="size-3.5 text-emerald-600 dark:text-emerald-300" />
                    ) : (
                      <RadioTower className="size-3.5 text-sky-600 dark:text-sky-300" />
                    )}
                    <span className="text-sm">{providerForm.kind === "ncore" ? "nCore API" : "Torznab"}</span>
                    <Badge
                      variant={providerForm.kind === "ncore" ? "success" : "sky"}
                      className="ml-auto"
                    >
                      {providerForm.kind}
                    </Badge>
                  </div>
                </Field>
              </div>
              <Field
                label="Base URL"
                hint={
                  providerForm.kind === "ncore"
                    ? "The ncore-go base URL, without a trailing slash."
                    : "Use the Torznab API URL from Prowlarr or Jackett."
                }
              >
                <Input
                  value={providerForm.baseUrl}
                  onChange={(event) => setProviderForm({ ...providerForm, baseUrl: event.target.value })}
                  placeholder={
                    providerForm.kind === "ncore" ? "http://ncore:8080" : "http://prowlarr:9696/1/api"
                  }
                />
              </Field>
              {providerForm.kind === "ncore" ? (
                <>
                  <Field label="Username">
                    <Input
                      value={providerForm.username}
                      onChange={(event) => setProviderForm({ ...providerForm, username: event.target.value })}
                      placeholder="nCore username"
                    />
                  </Field>
                  <Field
                    label="Password"
                    hint={providerForm.id ? "Leave blank to keep the saved password." : "Stored encrypted in SQLite."}
                  >
                    <Input
                      type="password"
                      value={providerForm.password}
                      onChange={(event) => setProviderForm({ ...providerForm, password: event.target.value })}
                      placeholder={providerForm.id ? "•••••••• (saved)" : "nCore password"}
                      autoComplete="off"
                    />
                  </Field>
                </>
              ) : (
                <>
                  <Field
                    label="API key"
                    hint={
                      providerForm.id
                        ? "Leave blank to keep the saved key."
                        : "Optional for indexers that do not require a key."
                    }
                  >
                    <Input
                      type="password"
                      value={providerForm.apiKey}
                      onChange={(event) => setProviderForm({ ...providerForm, apiKey: event.target.value })}
                      placeholder={providerForm.id ? "•••••••• (saved)" : "Torznab API key"}
                      autoComplete="off"
                    />
                  </Field>
                  <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/15 px-4 py-3">
                    <div>
                      <div className="text-sm font-medium">Allow external download hosts</div>
                      <div className="text-[10px] text-muted-foreground">
                        Disabled by default. Enable only if your indexer redirects downloads to another host.
                      </div>
                    </div>
                    <Switch
                      checked={providerForm.allowExternalDownloads}
                      onCheckedChange={(allowExternalDownloads) =>
                        setProviderForm({ ...providerForm, allowExternalDownloads })
                      }
                    />
                  </div>
                </>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Priority" hint="Lower numbers are preferred when results tie.">
                  <Input
                    type="number"
                    value={providerForm.priority}
                    onChange={(event) =>
                      setProviderForm({ ...providerForm, priority: Number(event.target.value) })
                    }
                  />
                </Field>
                <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/15 px-4 py-3">
                  <div className="text-sm font-medium">Enabled</div>
                  <Switch
                    checked={providerForm.enabled}
                    onCheckedChange={(enabled) => setProviderForm({ ...providerForm, enabled })}
                  />
                </div>
              </div>
            </div>
          )}

          {!providerForm.id && wizardStep === 2 && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border/70 bg-muted/15 p-4">
                <div className="flex items-center justify-between gap-3 border-b border-border/60 pb-3">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Provider</div>
                    <div className="mt-0.5 text-sm font-semibold">{providerForm.name.trim()}</div>
                  </div>
                  <Badge variant={providerForm.kind === "ncore" ? "success" : "sky"}>
                    {providerForm.kind === "ncore" ? "nCore API" : "Torznab"}
                  </Badge>
                </div>
                <div className="mt-3 grid gap-3 text-xs sm:grid-cols-2">
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Base URL</div>
                    <div className="mt-0.5 break-all font-mono text-foreground/90">{providerForm.baseUrl.trim()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Credentials</div>
                    <div className="mt-0.5 text-foreground/90">
                      {providerForm.kind === "ncore"
                        ? `${providerForm.username.trim()} · password set`
                        : providerForm.apiKey
                          ? "API key provided"
                          : "No API key"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Priority</div>
                    <div className="mt-0.5 text-foreground/90">{providerForm.priority}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wider text-muted-foreground">State</div>
                    <div className="mt-0.5 text-foreground/90">{providerForm.enabled ? "Enabled" : "Disabled"}</div>
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-muted/15 px-4 py-3">
                <div>
                  <div className="text-sm font-medium">Test after adding</div>
                  <div className="text-[10px] text-muted-foreground">
                    Verify the credentials immediately and show the result as a toast.
                  </div>
                </div>
                <Switch checked={testAfterAdd} onCheckedChange={setTestAfterAdd} />
              </div>
            </div>
          )}

          <DialogFooter>
            {providerForm.id ? (
              <>
                <Button variant="outline" onClick={() => setProviderOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={submitProvider}
                  disabled={createProvider.isPending || updateProvider.isPending}
                >
                  {updateProvider.isPending ? <Loader2 className="animate-spin" /> : <Check />} Update provider
                </Button>
              </>
            ) : wizardStep === 0 ? (
              <Button variant="outline" onClick={() => setProviderOpen(false)}>
                Cancel
              </Button>
            ) : wizardStep === 1 ? (
              <>
                <Button variant="outline" onClick={() => setWizardStep(0)}>
                  <ArrowLeft /> Back
                </Button>
                <Button onClick={continueWizard}>
                  Continue <ArrowRight />
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setWizardStep(1)}>
                  <ArrowLeft /> Back
                </Button>
                <Button onClick={submitProvider} disabled={createProvider.isPending}>
                  {createProvider.isPending ? <Loader2 className="animate-spin" /> : <Check />} Add provider
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
