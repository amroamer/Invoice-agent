import os
from datetime import date
from decimal import Decimal

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://app:app@localhost:5432/test")
os.environ.setdefault("JWT_SECRET", "test-secret")

from app.services.historical_parser import parse_historical  # noqa: E402


def test_csv_invoice_parse() -> None:
    csv = (
        "invoice_number,vendor_trn,contract_number,invoice_date,subtotal,vat,total,status,paid_amount,payment_date,payment_reference\n"
        "INV-1,300123,CNT-1,2025-11-15,1000.00,150.00,1150.00,paid,1150.00,2025-12-01,REF-1\n"
        "INV-2,300123,CNT-1,2026-01-20,2000.00,300.00,2300.00,partially_paid,1150.00,,REF-2\n"
    ).encode()
    result = parse_historical("invoices.csv", csv)
    assert len(result.invoices) == 2
    assert result.invoices[0].invoice_number == "INV-1"
    assert result.invoices[0].invoice_date == date(2025, 11, 15)
    assert result.invoices[0].total == Decimal("1150.00")
    assert result.invoices[0].status == "paid"
    assert result.invoices[1].status == "partially_paid"
    assert result.invoices[1].paid_amount == Decimal("1150.00")
    assert result.row_errors == 0


def test_csv_accepts_alternate_date_format() -> None:
    csv = (
        "invoice_number,vendor_trn,contract_number,invoice_date,subtotal,vat,total\n"
        "INV-3,300123,CNT-1,15/11/2025,1000,150,1150\n"
    ).encode()
    result = parse_historical("inv.csv", csv)
    assert result.invoices[0].invoice_date == date(2025, 11, 15)
    assert result.row_errors == 0


def test_missing_invoice_number_flagged() -> None:
    csv = (
        "invoice_number,vendor_trn,contract_number,invoice_date,subtotal,vat,total\n"
        ",300123,CNT-1,2025-11-15,1000,150,1150\n"
    ).encode()
    result = parse_historical("inv.csv", csv)
    assert any("invoice_number" in e for e in result.invoices[0].errors)


def test_invalid_date_flagged_without_crash() -> None:
    csv = (
        "invoice_number,vendor_trn,contract_number,invoice_date,subtotal,vat,total\n"
        "INV-X,300123,CNT-1,not-a-date,1000,150,1150\n"
    ).encode()
    result = parse_historical("inv.csv", csv)
    assert any("invalid date" in e for e in result.invoices[0].errors)
