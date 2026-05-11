SHELL := /bin/bash
COMPOSE ?= docker compose
COMPOSE_PROD := docker compose -f docker-compose.prod.yml
BACKUP_DIR ?= ./backups
TS := $(shell date +%Y%m%d_%H%M%S)

.PHONY: help up down logs ps build rebuild migrate seed shell psql redis-cli \
        ollama-pull test lint dump restore azcopy smoke load-test prod-up prod-down prod-logs

help:
	@echo "Targets:"
	@echo "  up / down / logs / ps / build / rebuild"
	@echo "  migrate      - alembic upgrade head"
	@echo "  seed         - load demo data (admin, officer, project, vendor, contract, BoQ, historical invoices)"
	@echo "  shell        - shell into backend container"
	@echo "  psql         - psql into postgres"
	@echo "  redis-cli    - redis-cli into redis"
	@echo "  ollama-pull  - pull OLLAMA_MODEL (default qwen2.5:7b)"
	@echo "  test / lint  - pytest / ruff"
	@echo "  dump         - pg_dump to $(BACKUP_DIR)/"
	@echo "  restore      - pg_restore latest dump (FILE=<path> to pin)"
	@echo "  azcopy       - sync upload dir to Azure blob (AZ_BLOB_URL env)"
	@echo "  smoke        - run end-to-end smoke test"
	@echo "  load-test    - run the 50/day load test script"
	@echo "  prod-up / prod-down / prod-logs"

up:
	$(COMPOSE) up -d

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=200

ps:
	$(COMPOSE) ps

build:
	$(COMPOSE) build

rebuild:
	$(COMPOSE) build --no-cache

migrate:
	$(COMPOSE) exec backend alembic upgrade head

seed:
	$(COMPOSE) exec backend python -m app.db.seed

shell:
	$(COMPOSE) exec backend bash

psql:
	$(COMPOSE) exec postgres psql -U $${POSTGRES_USER:-app} -d $${POSTGRES_DB:-finance_invoicing}

redis-cli:
	$(COMPOSE) exec redis redis-cli

ollama-pull:
	$(COMPOSE) exec ollama ollama pull $${OLLAMA_MODEL:-qwen2.5:7b}

test:
	$(COMPOSE) exec backend pytest -q

lint:
	$(COMPOSE) exec backend ruff check /app

dump:
	@mkdir -p $(BACKUP_DIR)
	$(COMPOSE) exec -T postgres pg_dump -U $${POSTGRES_USER:-app} -Fc $${POSTGRES_DB:-finance_invoicing} > $(BACKUP_DIR)/dump_$(TS).pgc
	@echo "wrote $(BACKUP_DIR)/dump_$(TS).pgc"

restore:
	@test -n "$(FILE)" || (ls -1t $(BACKUP_DIR)/*.pgc 2>/dev/null | head -1 | xargs -I{} echo "using {}"; true)
	@FILE_TO_USE=$${FILE:-$$(ls -1t $(BACKUP_DIR)/*.pgc 2>/dev/null | head -1)}; \
	test -f "$$FILE_TO_USE" || { echo "no dump file"; exit 1; }; \
	echo "restoring from $$FILE_TO_USE"; \
	$(COMPOSE) exec -T postgres pg_restore -U $${POSTGRES_USER:-app} -d $${POSTGRES_DB:-finance_invoicing} --clean --if-exists < "$$FILE_TO_USE"

azcopy:
	@test -n "$(AZ_BLOB_URL)" || { echo "set AZ_BLOB_URL"; exit 1; }
	azcopy sync ./data/uploads "$(AZ_BLOB_URL)"

smoke:
	bash scripts/smoke_test.sh

load-test:
	$(COMPOSE) exec backend python /app/../scripts/load_test.py || python scripts/load_test.py

prod-up:
	$(COMPOSE_PROD) up -d

prod-down:
	$(COMPOSE_PROD) down

prod-logs:
	$(COMPOSE_PROD) logs -f --tail=200
