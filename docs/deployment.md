# Deployment — Azure VM

Runbook for provisioning the Finance Invoicing Agent on an Azure VM running Ubuntu 22.04 LTS. Target: a single-VM production install behind TLS, fronted by Nginx, with Ollama co-located.

## 1. VM sizing

| Scenario | SKU | Notes |
|---|---|---|
| CPU-only (recommended for MVP pilot) | D8s v5 (8 vCPU, 32 GB) | Ollama runs on CPU; NFR-001/NFR-002 achievable with Qwen2.5:7b at moderate volume. |
| GPU (future-proofed) | NCas T4 v3 | T4 GPU dramatically speeds Qwen inference. Use for peak-load sites. |

Storage: add a 128 GB data disk mounted at `/var/lib/docker` (image + volume data).

## 2. Provisioning

1. Create VM — Ubuntu 22.04 LTS. Open only port 443 inbound at the NSG; keep SSH behind JIT access.
2. Attach a Premium SSD data disk, format ext4, mount at `/var/lib/docker` before installing Docker.
3. Install Docker Engine + Compose plugin:
   ```bash
   curl -fsSL https://get.docker.com | sh
   sudo usermod -aG docker $USER
   ```
4. Install `azcopy` for blob sync during the migration step.
5. Clone the repo:
   ```bash
   git clone <repo-url> /opt/finance-invoicing
   cd /opt/finance-invoicing
   ```

## 3. TLS

1. Point DNS A record to the VM public IP.
2. Issue a cert via Certbot (host-side) or use an existing wildcard:
   ```bash
   sudo snap install --classic certbot
   sudo certbot certonly --standalone -d invoicing.example.com
   ```
3. Copy `fullchain.pem` and `privkey.pem` into `./nginx/certs/`.

Alternatively: terminate TLS at an Azure Application Gateway in front of the VM and let the nginx-in-container listen on port 80 only.

## 4. Secrets

Create `.env` from `.env.example`. Recommended: store these in Azure Key Vault and inject at boot via the VM managed identity (systemd unit template, or AKS secrets if you migrate to containers later). Minimum set:

- `POSTGRES_PASSWORD`, `JWT_SECRET`, `PASSWORD_PEPPER` — rotate on day one.
- `OLLAMA_MODEL` — pin to `qwen2.5:7b` (default) or larger if VM size allows.
- `STORAGE_BACKEND=azure_blob` + blob container URL for production file storage.

Never commit `.env`.

## 5. Bring the stack up

```bash
cd /opt/finance-invoicing
make prod-up                           # docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec ollama ollama pull qwen2.5:7b
```

The backend entrypoint applies migrations on startup. For a fresh production install, do not run `make seed` — start with empty master data and upload the real contracts/BoQs/historical invoices via the UI.

## 6. Day-zero smoke

```bash
BASE_URL=https://invoicing.example.com/api \
SMOKE_USER=admin \
SMOKE_PASS=<initial admin password> \
bash scripts/smoke_test.sh
```

The readiness check hits Postgres/Redis/Ollama — expect a 200 once `ollama pull` finishes.

## 7. Backups

Cron job (as root on the VM):

```cron
0 1 * * *  cd /opt/finance-invoicing && /usr/bin/make dump BACKUP_DIR=/var/backups/finance && find /var/backups/finance -mtime +30 -delete
```

Sync to Azure Blob with a second cron:

```cron
15 1 * * *  /usr/local/bin/azcopy sync /var/backups/finance "https://<account>.blob.core.windows.net/finance-backups?<sas>" --recursive
```

Use Azure Backup for VM-level snapshots if your policy requires it.

## 8. Monitoring

- Azure Monitor agent for CPU/memory/disk + container stdout logs (structured JSON).
- Enable alerts on `/health/ready` returning non-200 via a ping test.
- Dashboard: `Admin → Audit → LLM calls` surfaces per-call latency; watch the 95th percentile vs NFR-002.

## 9. CI/CD

GitHub Actions workflow in `.github/workflows/ci.yml` runs the Python + Node test suites on every push. For continuous deploy, add a second workflow that SSHes into the VM (using a deploy key stored in Key Vault) and runs:

```bash
cd /opt/finance-invoicing && git pull && make prod-up
```

## 10. Rollback

If a release misbehaves, roll back to the prior commit and re-run `make prod-up`. If the database schema changed, you'll need to restore the last dump (`make restore FILE=...`). Always take a fresh `make dump` immediately before a release.
