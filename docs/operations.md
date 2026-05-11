# Operations runbook

Day-to-day operator reference for the Finance Invoicing Agent.

## Common tasks

| Task | Command |
|---|---|
| Start the stack | `make up` |
| Stop the stack | `make down` |
| Tail logs | `make logs` |
| Apply migrations | `make migrate` |
| Seed demo data | `make seed` |
| Backend shell | `make shell` |
| Postgres shell | `make psql` |
| Redis shell | `make redis-cli` |
| Pull Ollama model | `make ollama-pull` |
| Run tests | `make test` |
| Ruff lint | `make lint` |
| Dump database | `make dump` |
| Restore latest | `make restore` |
| Smoke test | `make smoke` |
| Load test | `make load-test` |

Production variants: `make prod-up`, `make prod-down`, `make prod-logs`.

## Credentials (demo seed)

- Admin: `admin / Admin!pass123`
- Officer: `officer / Officer!pass123`

**Rotate immediately** in production.

## Health endpoints

| Endpoint | Purpose | Returns |
|---|---|---|
| `/api/health` | Liveness — always 200 if the process is up. | `{"status":"ok"}` |
| `/api/health/ready` | Readiness — checks Postgres, Redis, Ollama. | 200 or 503 |
| `/api/health/detail` | Admin-only — config + storage + dependency latency. | JSON blob |

## Pipeline

```
Upload → OCR → Extract (Ollama) → Officer review
      → Match (top 3 candidates) → Officer confirm
      → BoQ line mapping (Ollama suggests) → Officer confirm
      → Validate (7 rules) → Recommend (3 scenarios)
      → Officer decide → (optional) Record payment
```

Failed stages can be replayed:

- Extraction: `POST /api/invoices/{id}/re-extract`
- Match scoring: `POST /api/matching/{id}/candidates`
- BoQ mapping: `POST /api/matching/{id}/map-boq`
- Validation + recommendation: `POST /api/recommendations/{id}/generate`

## Common issues

### Upload returns 502

The backend container may be restarting (check `make ps` and `make logs`). If Celery cannot reach Redis the upload still succeeds but extraction is queued — the review page will show a "re-run" prompt.

### Extraction never completes

1. Check Ollama: `docker compose exec ollama ollama list`. The model must be present.
2. Check the Celery worker: `docker compose logs worker`.
3. Admin → Audit → LLM calls — recent failures show an `ERROR: ...` response.

### All validations say vendor mismatch

The matching step may have locked the invoice to the wrong vendor. An admin can unlock via `POST /api/matching/{id}/unlock`, then re-match.

### Contract progress bar is red

Indicates the invoice pushes the contract cumulative over its value. Either the Conditional scenario's deduction (shown on the Recommendation page) or rejecting the excess is expected.

## Backups

Daily dump is cron-scheduled (see deployment.md §7). Manual:

```bash
make dump                 # writes ./backups/dump_<ts>.pgc
make restore              # restores the newest dump in ./backups/
make restore FILE=...     # restores a specific file
```

## Log locations

- Backend stdout: structured JSON, tagged with `correlation_id`. Pipe to Azure Monitor or any log aggregator.
- Audit log (user actions): `Admin → Audit → User actions`, also `audit_logs` table and `/audit/logs.csv` export.
- LLM call log: `Admin → Audit → LLM calls`, `llm_calls` table. Retention: 90 days (PRD §9).
