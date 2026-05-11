import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import (
    audit,
    auth,
    boq,
    contracts,
    dashboard,
    decisions,
    health,
    historical_invoices,
    invoices,
    matching,
    payments,
    projects,
    recommendations,
    settings as settings_api,
    users,
    validation,
    vendors,
)
from app.core.config import get_settings
from app.core.logging import configure_logging, new_correlation_id, set_correlation_id

configure_logging()
log = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI(
    title="Finance Invoicing Agent",
    version="0.1.0",
    description="KPMG Finance Invoicing Agent API",
    openapi_url="/openapi.json",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


_SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Permissions-Policy": "geolocation=(), microphone=(), camera=()",
}


@app.middleware("http")
async def correlation_middleware(request: Request, call_next):
    cid = request.headers.get("x-correlation-id") or new_correlation_id()
    set_correlation_id(cid)
    log.info(
        "request_start",
        extra={"method": request.method, "path": request.url.path},
    )
    try:
        response = await call_next(request)
    except Exception:
        log.exception("unhandled_error", extra={"path": request.url.path})
        body = (
            {"detail": "Internal Server Error", "correlation_id": cid}
            if settings.app_env != "production"
            else {"detail": "Internal Server Error"}
        )
        return JSONResponse(body, status_code=500)
    response.headers["x-correlation-id"] = cid
    for k, v in _SECURITY_HEADERS.items():
        response.headers.setdefault(k, v)
    if settings.app_env == "production":
        response.headers.setdefault(
            "Strict-Transport-Security", "max-age=31536000; includeSubDomains"
        )
    log.info("request_end", extra={"status": response.status_code})
    return response


app.include_router(health.router, prefix="/health", tags=["system"])
app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(users.router, prefix="/users", tags=["users"])
app.include_router(projects.router, prefix="/projects", tags=["projects"])
app.include_router(vendors.router, prefix="/vendors", tags=["vendors"])
app.include_router(contracts.router, prefix="/contracts", tags=["contracts"])
app.include_router(boq.router, prefix="/boq", tags=["boq"])
app.include_router(historical_invoices.router, prefix="/historical-invoices", tags=["historical"])
app.include_router(invoices.router, prefix="/invoices", tags=["invoices"])
app.include_router(matching.router, prefix="/matching", tags=["matching"])
app.include_router(validation.router, prefix="/validation", tags=["validation"])
app.include_router(recommendations.router, prefix="/recommendations", tags=["recommendations"])
app.include_router(decisions.router, prefix="/decisions", tags=["decisions"])
app.include_router(payments.router, prefix="/payments", tags=["payments"])
app.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
app.include_router(audit.router, prefix="/audit", tags=["audit"])
app.include_router(settings_api.router, prefix="/settings", tags=["settings"])
