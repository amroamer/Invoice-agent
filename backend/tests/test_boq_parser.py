import os
from decimal import Decimal

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://app:app@localhost:5432/test")
os.environ.setdefault("JWT_SECRET", "test-secret")

from app.services.boq_parser import parse_boq, preview  # noqa: E402


def test_csv_parse_happy_path() -> None:
    csv = (
        "line_number,description,uom,quantity,unit_price\n"
        "1,Site prep,lot,1,80000\n"
        "2,Demolition,m2,250,120\n"
    ).encode()
    rows = parse_boq("boq.csv", csv)
    assert len(rows) == 2
    assert rows[0].description == "Site prep"
    assert rows[1].quantity == Decimal("250")
    assert rows[1].line_total == Decimal("30000.00")
    assert all(not r.errors for r in rows)


def test_csv_header_aliases() -> None:
    csv = (
        "Line #,Description,Unit,Qty,Rate,Total\n"
        "1,Tiling,m2,100,50,5000\n"
    ).encode()
    rows = parse_boq("boq.csv", csv)
    assert len(rows) == 1
    assert rows[0].uom == "m2"
    assert rows[0].quantity == Decimal("100")
    assert rows[0].unit_price == Decimal("50")
    assert rows[0].line_total == Decimal("5000.00")


def test_csv_flags_total_mismatch() -> None:
    csv = (
        "line_number,description,uom,quantity,unit_price,line_total\n"
        "1,Demolition,m2,10,100,999.00\n"
    ).encode()
    rows = parse_boq("boq.csv", csv)
    assert rows[0].errors
    assert "differs" in rows[0].errors[0]


def test_missing_required_column_raises() -> None:
    csv = b"line_number,description,quantity,unit_price\n1,Foo,1,1\n"
    try:
        parse_boq("boq.csv", csv)
    except ValueError as exc:
        assert "uom" in str(exc)
    else:
        raise AssertionError("expected ValueError")


def test_preview_within_tolerance() -> None:
    csv = (
        "line_number,description,uom,quantity,unit_price\n"
        "1,Site prep,lot,1,100\n"
        "2,Demolition,m2,10,10\n"
    ).encode()
    rows = parse_boq("boq.csv", csv)
    result = preview(rows, contract_value=Decimal("200"), tolerance_pct=1.0)
    assert result.sum_line_total == Decimal("200.00")
    assert result.within_tolerance is True


def test_preview_out_of_tolerance() -> None:
    csv = (
        "line_number,description,uom,quantity,unit_price\n"
        "1,Site prep,lot,1,100\n"
    ).encode()
    rows = parse_boq("boq.csv", csv)
    result = preview(rows, contract_value=Decimal("1000"), tolerance_pct=0.5)
    assert result.within_tolerance is False


def test_preview_no_contract_value() -> None:
    csv = b"line_number,description,uom,quantity,unit_price\n1,X,lot,1,100\n"
    rows = parse_boq("boq.csv", csv)
    result = preview(rows, contract_value=None, tolerance_pct=0.0)
    assert result.within_tolerance is None
