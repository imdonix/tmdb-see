# tmdb-see Helm chart

Minimal single-replica deployment for See. It reuses the old
`ncore-tmdb-secrets` and mirrors the old host layout. nCore and
qBittorrent are bundled by default.

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

qbit:
  enabled: true
  image: qbittorrentofficial/qbittorrent-nox:latest
  configPath: /mnt/hdd/qbit-config
  downloadsPath: /mnt/hdd/downloads
  resources:
    requests:
      cpu: 50m
      memory: 128Mi
    limits:
      cpu: "1"
      memory: 1Gi

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

## Bundled qBittorrent

`qbit.enabled=true` deploys `qbittorrentofficial/qbittorrent-nox` with:

- WebUI on `qbittorrent:8080` (`ClusterIP`, internal only);
- BitTorrent on `6881` TCP and UDP;
- `/config` on `qbit.configPath` and `/downloads` on `qbit.downloadsPath`
  (hostPath, `DirectoryOrCreate`);
- `terminationGracePeriodSeconds: 1800` so active torrents can flush.

The official image has no credential environment variables and otherwise
prints a random temporary password on first boot. An init container runs
`files/qbit-seed-config.py`, which writes a PBKDF2-SHA512 hash derived from the
Secret's `QBIT_USER`/`QBIT_PASS` into
`/config/qBittorrent/config/qBittorrent.conf` before qBittorrent starts.
See reads the same Secret keys, so both sides agree from the first start.
The Secret is the source of truth: a password changed in the qBittorrent
Web UI is replaced with the Secret value the next time the pod starts.

Set `qbit.enabled=false` and point `env.qbitHost` at an existing qBittorrent
instance if you already run one.

## Fixed behaviour

- Deployment/Service on port `8080`; one replica.
- PVC at `/app/data` (`persistence.enabled=true`).
- Single Ingress for the whole host, path `/`.
- `Recreate` strategy.
- Probes against `/api/health`.
- Non-root UID/GID 1000, read-only root filesystem, `/tmp` emptyDir.
- Bundled ncore-go at `ncore:8080`.
- Bundled qBittorrent-nox at `qbittorrent:8080`.

## Jellyfin

`env.qbitSavePath` is the base downloads path inside qBittorrent. See writes
`Movies/` and `TV Shows/` beneath it. Point Jellyfin at:

- `<qbit.downloadsPath>/Movies`
- `<qbit.downloadsPath>/TV Shows`

Keep the host path readable by the Jellyfin container. qBittorrent writes as
UID/GID 1000 by default.

## Validate

```bash
helm lint .
helm template tmdb-see . --set persistence.enabled=false
```
