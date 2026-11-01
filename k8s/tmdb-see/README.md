# tmdb-see Helm chart

Minimal single-replica deployment for See. It reuses the old
`ncore-tmdb-secrets` and mirrors the old host layout.

## Install

```bash
kubectl create secret generic ncore-tmdb-secrets \
  --from-literal=TMDB_API_KEY=... \
  --from-literal=NCORE_USER=... \
  --from-literal=NCORE_PASS=... \
  --from-literal=QBIT_USER=... \
  --from-literal=QBIT_PASS=... \
  --from-literal=OLLAMA_API_KEY=... \
  --from-literal=APP_SECRET="$(openssl rand -hex 32)"

helm upgrade --install tmdb-see . \
  --namespace default \
  --set env.qbitHost=http://qbittorrent:8080 \
  --set ingress.host=tmdb.local
```

Open:

- TMDB proxy: `http://tmdb.local/`
- Dashboard: `http://tmdb.local/see`

The image defaults to `imdonix/tmdb-see:latest` with `IfNotPresent`,
matching the old k3s image-import workflow. Build/import or push the image
before installing.

## Values

```yaml
image:
  repository: imdonix/tmdb-see
  tag: latest
  pullPolicy: IfNotPresent

existingSecret: ncore-tmdb-secrets

env:
  ncoreHost: http://ncore:8080
  qbitHost: http://qbittorrent:8080
  qbitSavePath: /downloads
  qbitOrganize: "true"

persistence:
  enabled: true
  size: 1Gi
  storageClass: ""

ingress:
  enabled: true
  className: traefik
  host: tmdb.local

ncore:
  enabled: true
  image: imdonix/ncore:latest

resources:
  requests:
    cpu: 50m
    memory: 128Mi
  limits:
    cpu: 500m
    memory: 512Mi
```

## Secret keys

The Deployment reads these optional keys from `existingSecret`:

`TMDB_API_KEY`, `NCORE_USER`, `NCORE_PASS`, `QBIT_USER`, `QBIT_PASS`,
`OLLAMA_API_KEY`, `APP_SECRET`.

Missing values can be configured in the dashboard after startup.
`APP_SECRET` is recommended; without it See creates `DATA_DIR/secret.key` on
the PVC.

## Fixed behaviour

- Deployment/Service on port `8080`; one replica.
- PVC at `/app/data` (`persistence.enabled=true`).
- Single Ingress for the whole host, path `/`.
- `Recreate` strategy.
- Probes against `/api/health`.
- Non-root UID/GID 1000, read-only root filesystem, `/tmp` emptyDir.
- Optional bundled ncore-go at `ncore:8080`.
- qBittorrent is external.

## Jellyfin

`env.qbitSavePath` is the base downloads path inside qBittorrent. See writes
`Movies/` and `TV Shows/` beneath it. Point Jellyfin at:

- `<qbitSavePath>/Movies`
- `<qbitSavePath>/TV Shows`

## Validate

```bash
helm lint .
helm template tmdb-see . --set persistence.enabled=false
```
