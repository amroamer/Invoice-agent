import os

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://app:app@localhost:5432/test")
os.environ.setdefault("JWT_SECRET", "test-secret")

from app.agents.extraction import FIELD_KEYS, _normalize, _parse_response  # noqa: E402


def test_parse_strips_markdown_fences() -> None:
    raw = '```json\n{"invoice_number": "INV-1"}\n```'
    assert _parse_response(raw)["invoice_number"] == "INV-1"


def test_parse_tolerates_leading_prose() -> None:
    raw = 'Sure! Here is the JSON:\n{"invoice_number": "INV-2"}\n'
    assert _parse_response(raw)["invoice_number"] == "INV-2"


def test_normalize_fills_all_field_keys_and_clamps_confidence() -> None:
    parsed = {
        "invoice_number": "INV-3",
        "confidence": {"invoice_number": 200, "vendor_trn": -5},
    }
    result = _normalize(parsed)
    assert result.fields["invoice_number"] == "INV-3"
    for k in FIELD_KEYS:
        assert k in result.fields
        assert 0 <= result.confidence[k] <= 100
    assert result.confidence["invoice_number"] == 100
    assert result.confidence["vendor_trn"] == 0


def test_normalize_line_items_coerced_to_strings() -> None:
    parsed = {
        "line_items": [
            {"description": "Tiling", "quantity": 100, "unit_price": 50, "line_total": 5000}
        ],
        "confidence": {"line_items": 85},
    }
    result = _normalize(parsed)
    assert len(result.line_items) == 1
    li = result.line_items[0]
    assert li["quantity"] == "100"
    assert li["line_total"] == "5000"
    assert li["line_number"] == 1
