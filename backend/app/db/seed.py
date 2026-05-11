"""Seed the local database with demo data for development.

Run: python -m app.db.seed
Idempotent — if the admin user exists, the script exits without changes.
"""
import logging
from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.db.session import SessionLocal
from app.models.boq_item import BoqItem
from app.models.contract import Contract
from app.models.enums import (
    InvoiceSource,
    InvoiceStatus,
    ProjectStatus,
    UserRole,
    VatTreatment,
)
from app.models.invoice import Invoice
from app.models.invoice_line_item import InvoiceLineItem
from app.models.payment import Payment
from app.models.project import Project
from app.models.user import User
from app.models.vendor import Vendor

log = logging.getLogger(__name__)


def run(db: Session) -> None:
    if db.query(User).filter(User.username == "admin").first():
        log.info("seed: admin already exists, skipping")
        return

    # Use .example TLD (RFC 2606 reserved) — the email-validator library rejects
    # .local because it's resolved via mDNS and not deliverable.
    admin = User(
        email="admin@kpmg.example",
        username="admin",
        full_name="Demo Administrator",
        password_hash=hash_password("Admin!pass123"),
        role=UserRole.admin,
    )
    officer = User(
        email="officer@kpmg.example",
        username="officer",
        full_name="Demo Finance Officer",
        password_hash=hash_password("Officer!pass123"),
        role=UserRole.officer,
    )
    db.add_all([admin, officer])
    db.flush()

    project = Project(
        name="Riyadh HQ Fit-Out — Phase 1",
        client_entity="KPMG Professional Services",
        description="Interior fit-out works, Riyadh headquarters",
        start_date=date(2025, 10, 1),
        end_date=date(2026, 9, 30),
        status=ProjectStatus.active,
        created_by=admin.id,
        updated_by=admin.id,
    )
    db.add(project)
    db.flush()

    vendor = Vendor(
        legal_name="Al-Manara Contracting Co. LLC",
        trn="300123456700003",
        cr_number="1010123456",
        bank_details={"bank": "Al Rajhi Bank", "iban": "SA0380000000608010167519"},
        contact_email="billing@al-manara.example",
        active=True,
        created_by=admin.id,
        updated_by=admin.id,
    )
    db.add(vendor)
    db.flush()

    contract = Contract(
        project_id=project.id,
        vendor_id=vendor.id,
        contract_number="CNT-2025-001",
        value=Decimal("1000000.00"),
        currency="SAR",
        start_date=date(2025, 10, 15),
        end_date=date(2026, 7, 31),
        retention_pct=Decimal("5.00"),
        advance_pct=Decimal("10.00"),
        vat_treatment=VatTreatment.exclusive,
        status=ProjectStatus.active,
        created_by=admin.id,
        updated_by=admin.id,
    )
    db.add(contract)
    db.flush()

    boq_lines = [
        (1, "Site preparation & enabling works", "lot", Decimal("1"), Decimal("80000.00")),
        (2, "Demolition & removals", "m2", Decimal("250"), Decimal("120.00")),
        (3, "Gypsum partition walls", "m2", Decimal("800"), Decimal("210.00")),
        (4, "Suspended ceiling system", "m2", Decimal("1200"), Decimal("180.00")),
        (5, "Floor tiling — porcelain", "m2", Decimal("1000"), Decimal("260.00")),
        (6, "HVAC ductwork & diffusers", "lot", Decimal("1"), Decimal("150000.00")),
        (7, "Electrical distribution & lighting", "lot", Decimal("1"), Decimal("180000.00")),
        (8, "Plumbing & sanitary fixtures", "lot", Decimal("1"), Decimal("60000.00")),
        (9, "Painting — walls & ceilings", "m2", Decimal("2500"), Decimal("36.00")),
    ]
    boq_items = []
    for line_no, desc, uom, qty, unit_price in boq_lines:
        item = BoqItem(
            contract_id=contract.id,
            line_number=line_no,
            description=desc,
            uom=uom,
            quantity=qty,
            unit_price=unit_price,
            line_total=(qty * unit_price).quantize(Decimal("0.01")),
            created_by=admin.id,
            updated_by=admin.id,
        )
        boq_items.append(item)
        db.add(item)
    db.flush()

    # Three historical invoices: paid, partially paid, unpaid.
    def make_invoice(
        number: str,
        inv_date: date,
        status: InvoiceStatus,
        lines: list[tuple[int, Decimal, Decimal]],
    ) -> Invoice:
        subtotal = sum((q * p for _, q, p in lines), Decimal("0"))
        vat = (subtotal * Decimal("0.15")).quantize(Decimal("0.01"))
        total = (subtotal + vat).quantize(Decimal("0.01"))
        inv = Invoice(
            contract_id=contract.id,
            vendor_id=vendor.id,
            invoice_number=number,
            invoice_date=inv_date,
            subtotal=subtotal,
            vat=vat,
            total=total,
            currency="SAR",
            source=InvoiceSource.historical,
            status=status,
            uploaded_by=admin.id,
            created_by=admin.id,
            updated_by=admin.id,
        )
        db.add(inv)
        db.flush()
        for idx, (boq_idx, qty, price) in enumerate(lines, start=1):
            db.add(
                InvoiceLineItem(
                    invoice_id=inv.id,
                    boq_item_id=boq_items[boq_idx].id,
                    line_number=idx,
                    description=boq_items[boq_idx].description,
                    uom=boq_items[boq_idx].uom,
                    quantity=qty,
                    unit_price=price,
                    line_total=(qty * price).quantize(Decimal("0.01")),
                )
            )
        return inv

    inv1 = make_invoice(
        "INV-2025-1001",
        date(2025, 11, 15),
        InvoiceStatus.paid,
        [(0, Decimal("1"), Decimal("80000.00")), (1, Decimal("250"), Decimal("120.00"))],
    )
    db.add(
        Payment(
            invoice_id=inv1.id,
            amount=inv1.total,
            payment_date=date(2025, 12, 5),
            reference="TRX-REF-1001",
            recorded_by=admin.id,
        )
    )

    inv2 = make_invoice(
        "INV-2025-1002",
        date(2026, 1, 20),
        InvoiceStatus.partially_paid,
        [(2, Decimal("400"), Decimal("210.00")), (3, Decimal("600"), Decimal("180.00"))],
    )
    db.add(
        Payment(
            invoice_id=inv2.id,
            amount=(inv2.total / 2).quantize(Decimal("0.01")),
            payment_date=date(2026, 2, 10),
            reference="TRX-REF-1002-PART",
            recorded_by=admin.id,
        )
    )

    make_invoice(
        "INV-2026-1003",
        date(2026, 3, 10),
        InvoiceStatus.pending,
        [(4, Decimal("300"), Decimal("260.00")), (8, Decimal("800"), Decimal("36.00"))],
    )

    db.commit()
    log.info("seed: complete")


def main() -> None:
    logging.basicConfig(level=logging.INFO)
    with SessionLocal() as db:
        run(db)


if __name__ == "__main__":
    main()
