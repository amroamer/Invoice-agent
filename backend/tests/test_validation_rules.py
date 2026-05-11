import os
from dataclasses import dataclass, field
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace
from uuid import UUID, uuid4

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://app:app@localhost:5432/test")
os.environ.setdefault("JWT_SECRET", "test-secret")

from app.models.enums import FindingSeverity  # noqa: E402
from app.validation.rules import (  # noqa: E402
    ARITH_LINE_MISMATCH,
    ARITH_SUBTOTAL,
    ARITH_TOTAL,
    ARITH_VAT,
    BOQ_MAPPING_MISSING,
    DATE_OUT_OF_WINDOW,
    UNIT_PRICE_DRIFT,
    check_arithmetic,
    check_boq_mapping,
    check_date_window,
    check_unit_price,
)


@dataclass
class FakeLine:
    id: UUID = field(default_factory=uuid4)
    line_number: int = 1
    quantity: Decimal = Decimal("0")
    unit_price: Decimal = Decimal("0")
    line_total: Decimal = Decimal("0")
    boq_item_id: UUID | None = None
    boq_item: object | None = None
    not_in_boq: bool = False
    description: str = ""
    uom: str | None = "unit"


def fake_invoice(lines: list[FakeLine], subtotal: Decimal, vat: Decimal, total: Decimal):
    return SimpleNamespace(
        id=uuid4(),
        line_items=lines,
        subtotal=subtotal,
        vat=vat,
        total=total,
        currency="SAR",
        invoice_number="INV-TEST",
        invoice_date=date(2026, 3, 1),
        contract_id=uuid4(),
        vendor_id=uuid4(),
    )


def test_arithmetic_all_correct_yields_nothing() -> None:
    lines = [
        FakeLine(quantity=Decimal("10"), unit_price=Decimal("100"), line_total=Decimal("1000.00"))
    ]
    inv = fake_invoice(lines, Decimal("1000.00"), Decimal("150.00"), Decimal("1150.00"))
    findings = check_arithmetic(inv, vat_rate=Decimal("0.15"))
    assert findings == []


def test_arithmetic_line_mismatch_flagged() -> None:
    lines = [
        FakeLine(quantity=Decimal("10"), unit_price=Decimal("100"), line_total=Decimal("999.00"))
    ]
    inv = fake_invoice(lines, Decimal("999.00"), Decimal("149.85"), Decimal("1148.85"))
    findings = check_arithmetic(inv, vat_rate=Decimal("0.15"))
    codes = [f.rule_code for f in findings]
    assert ARITH_LINE_MISMATCH in codes


def test_arithmetic_vat_off_is_flagged() -> None:
    lines = [
        FakeLine(quantity=Decimal("10"), unit_price=Decimal("100"), line_total=Decimal("1000.00"))
    ]
    inv = fake_invoice(lines, Decimal("1000.00"), Decimal("100.00"), Decimal("1100.00"))
    findings = check_arithmetic(inv, vat_rate=Decimal("0.15"))
    codes = [f.rule_code for f in findings]
    assert ARITH_VAT in codes
    assert ARITH_TOTAL in codes  # 1100 != 1000 + actual VAT computed from subtotal


def test_arithmetic_subtotal_mismatch_flagged() -> None:
    lines = [
        FakeLine(quantity=Decimal("10"), unit_price=Decimal("100"), line_total=Decimal("1000.00")),
        FakeLine(line_number=2, quantity=Decimal("5"), unit_price=Decimal("50"), line_total=Decimal("250.00")),
    ]
    inv = fake_invoice(lines, Decimal("2000.00"), Decimal("300.00"), Decimal("2300.00"))
    findings = check_arithmetic(inv, vat_rate=Decimal("0.15"))
    codes = [f.rule_code for f in findings]
    assert ARITH_SUBTOTAL in codes


def test_unit_price_drift_blocks_and_suggests_deduction() -> None:
    boq_item = SimpleNamespace(unit_price=Decimal("100.00"))
    line = FakeLine(
        quantity=Decimal("10"),
        unit_price=Decimal("110"),
        line_total=Decimal("1100.00"),
        boq_item_id=uuid4(),
        boq_item=boq_item,
    )
    inv = fake_invoice([line], Decimal("1100.00"), Decimal("165.00"), Decimal("1265.00"))
    findings = check_unit_price(inv, tolerance_pct=Decimal("0.0"))
    assert len(findings) == 1
    f = findings[0]
    assert f.rule_code == UNIT_PRICE_DRIFT
    assert f.severity == FindingSeverity.blocker
    assert f.suggested_deduction == Decimal("100.00")


def test_unit_price_within_tolerance_passes() -> None:
    boq_item = SimpleNamespace(unit_price=Decimal("100.00"))
    line = FakeLine(
        quantity=Decimal("10"),
        unit_price=Decimal("101"),
        line_total=Decimal("1010.00"),
        boq_item_id=uuid4(),
        boq_item=boq_item,
    )
    inv = fake_invoice([line], Decimal("1010.00"), Decimal("151.50"), Decimal("1161.50"))
    findings = check_unit_price(inv, tolerance_pct=Decimal("2.0"))
    assert findings == []


def test_date_out_of_window() -> None:
    # Pass a fake contract via a stub db lookup through model access.
    class StubSession:
        def get(self, cls, _id):
            return SimpleNamespace(
                start_date=date(2026, 1, 1),
                end_date=date(2026, 12, 31),
            )

    inv = fake_invoice([], Decimal("0"), Decimal("0"), Decimal("0"))
    inv.invoice_date = date(2026, 1, 1) - timedelta(days=1)
    findings = check_date_window(StubSession(), inv)
    assert len(findings) == 1
    assert findings[0].rule_code == DATE_OUT_OF_WINDOW


def test_boq_mapping_missing_warns_for_unmapped_lines() -> None:
    lines = [
        FakeLine(line_number=1, boq_item_id=None, not_in_boq=False),
        FakeLine(line_number=2, boq_item_id=uuid4(), not_in_boq=False),
    ]
    inv = fake_invoice(lines, Decimal("0"), Decimal("0"), Decimal("0"))
    findings = check_boq_mapping(inv)
    assert len(findings) == 1
    assert findings[0].rule_code == BOQ_MAPPING_MISSING
    assert findings[0].severity == FindingSeverity.warning
