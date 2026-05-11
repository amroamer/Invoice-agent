# Migration — Local → Azure VM

Playbook for moving a running local deployment (developer workstation) to the Azure VM. Referenced from PRD §12.

## What moves

| Data | Method |
|---|---|
| Postgres schema + data | `pg_dump` custom-format + `pg_restore` |
| Uploaded invoice/contract/BoQ files | `azcopy sync` to Azure Blob |
| Configuration (non-secrets) | `.env.example` + operator input |
| Secrets | Re-created in Azure Key Vault — **never** copied |
| Ollama models | Pulled fresh on the VM (`ollama pull qwen2.5:7b`) |

## Runbook

### 0. Pre-flight — on the local machine

- Freeze writes: tell officers to stop uploading. Put a banner on the dashboard if needed.
- Confirm all extraction tasks have drained:
  ```bash
  make shell
  python - <<'PY'
  from app.db.session import SessionLocal
  from app.models.extraction import Extraction
  from app.models.invoice import Invoice
  with SessionLocal() as db:
      pending = db.query(Invoice).filter(Invoice.status == "pending").count()
      print("pending invoices:", pending)
  PY
  ```

### 1. Dump the database

```bash
make dump                 # writes ./backups/dump_<ts>.pgc
```

Keep this file on the workstation until cutover is verified.

### 2. Sync uploads to Azure Blob

```bash
export AZ_BLOB_URL="https://<account>.blob.core.windows.net/uploads?<sas>"
make azcopy
```

### 3. Provision the VM (if not already)

Follow `docs/deployment.md` sections 1–4.

### 4. Copy the dump

```bash
scp backups/dump_<ts>.pgc azureuser@<vm>:/opt/finance-invoicing/backups/
```

### 5. Bring the stack up in restore mode

```bash
ssh azureuser@<vm>
cd /opt/finance-invoicing
make prod-up
docker compose -f docker-compose.prod.yml exec ollama ollama pull qwen2.5:7b
make restore FILE=/opt/finance-invoicing/backups/dump_<ts>.pgc
make migrate                       # applies any migrations newer than the dump
```

### 6. Switch the storage backend

Edit `.env`:

```
STORAGE_BACKEND=azure_blob
AZ_BLOB_URL=https://<account>.blob.core.windows.net/uploads
```

Re-create the container so the backend picks the new env:

```bash
docker compose -f docker-compose.prod.yml up -d --force-recreate backend worker
```

### 7. Smoke test

Run the same end-to-end smoke the deployment doc uses:

```bash
BASE_URL=https://invoicing.example.com/api bash scripts/smoke_test.sh
```

Additionally check through the UI:

- Log in as the seeded admin.
- Open three historical invoices and confirm totals and BoQ line mappings line up with the pre-migration screens.
- Upload a fresh test invoice and walk it through review → match → BoQ map → recommendation. Verify the OCR and extraction complete.
- Open the **Audit** tab: the migration-time events should be present; `LLM calls` should accumulate.

### 8. Cutover

- Flip DNS to the VM address (or the Application Gateway in front of it).
- Point operators to the new URL.

### 9. Keep the local dump

Retain `dump_<ts>.pgc` for **90 days** as rollback insurance. Nothing is copied back from the VM — if the cloud instance becomes authoritative, it stays authoritative.

## Rollback

If smoke tests fail:

1. Point DNS back at the workstation.
2. Investigate using the correlation IDs in the VM's stdout logs + the `/audit/logs` tab.
3. Retry once the root cause is fixed.

The local workstation's dump (`dump_<ts>.pgc`) is the authoritative snapshot at freeze time; any writes that happened on the VM before rollback are discarded.
