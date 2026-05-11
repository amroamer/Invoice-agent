"""Upload file validation and storage for invoice artifacts."""
from __future__ import annotations

import os
from dataclasses import dataclass
from uuid import UUID, uuid4

from fastapi import HTTPException, status

from app.core.config import get_settings

ALLOWED_EXTENSIONS = {"pdf", "png", "jpg", "jpeg", "tiff", "xlsx", "xlsm"}
ALLOWED_MIMES = {
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/tiff",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-excel.sheet.macroEnabled.12",
}


@dataclass
class StoredFile:
    path: str
    size_bytes: int
    original_name: str
    mime_type: str
    extension: str


def _ext(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def validate_upload(filename: str | None, mime: str | None, size_bytes: int) -> str:
    settings = get_settings()
    if not filename:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Missing filename")
    ext = _ext(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            f"Extension .{ext} not allowed. Allowed: {sorted(ALLOWED_EXTENSIONS)}",
        )
    if mime and mime not in ALLOWED_MIMES and not mime.startswith("image/"):
        # Be lenient about slightly-off MIME types from browsers — extension is authoritative.
        pass
    if size_bytes > settings.max_upload_mb * 1024 * 1024:
        raise HTTPException(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            f"File exceeds {settings.max_upload_mb} MB limit",
        )
    if size_bytes == 0:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Empty file")
    return ext


def store(
    invoice_id: UUID,
    blob: bytes,
    *,
    original_filename: str,
    mime_type: str,
    extension: str,
) -> StoredFile:
    settings = get_settings()
    target_dir = os.path.join(settings.upload_dir, "invoices", str(invoice_id))
    os.makedirs(target_dir, exist_ok=True)
    safe_name = f"{uuid4().hex}.{extension}"
    path = os.path.join(target_dir, safe_name)
    with open(path, "wb") as fh:
        fh.write(blob)
    return StoredFile(
        path=path,
        size_bytes=len(blob),
        original_name=os.path.basename(original_filename),
        mime_type=mime_type,
        extension=extension,
    )
