import os
from dataclasses import dataclass
from decimal import Decimal
from types import SimpleNamespace

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://app:app@localhost:5432/test")
os.environ.setdefault("JWT_SECRET", "test-secret")

from app.services.matching import (  # noqa: E402
    WEIGHT_AMOUNT,
    WEIGHT_CONTRACT_NUMBER,
    WEIGHT_PROJECT,
    WEIGHT_VENDOR,
    score_contract,
)
from app.services.text_similarity import contains, normalize, ratio  # noqa: E402


@dataclass
class FakeVendor:
    trn: str
    legal_name: str


def fake_contract(number="CNT-2025-001", vendor_trn="300123", vendor_name="Al-Manara Contracting Co. LLC", project_name="Riyadh HQ Fit-Out"):
    return SimpleNamespace(
        contract_number=number,
        vendor=FakeVendor(trn=vendor_trn, legal_name=vendor_name),
        project=SimpleNamespace(name=project_name),
    )


def test_normalize_trims_and_lowercases() -> None:
    assert normalize("  AL-MANARA ") == "al manara"
    assert normalize(None) == ""


def test_ratio_handles_empty() -> None:
    assert ratio(None, "foo") == 0.0
    assert ratio("foo", "") == 0.0


def test_contains_after_normalization() -> None:
    assert contains("CNT-2025-001", "Invoice for contract CNT 2025 001") is True
    assert contains("x", None) is False


def test_exact_contract_number_and_trn_scores_full() -> None:
    c = fake_contract()
    fields = {
        "contract_reference": "CNT-2025-001",
        "vendor_trn": "300123",
        "vendor_legal_name": "Al-Manara",
        "project_reference": "Riyadh HQ Fit-Out",
    }
    score, signals = score_contract(fields, Decimal("50000"), c, Decimal("500000"))
    by = {s.name: s for s in signals}
    assert by["contract_number"].score == WEIGHT_CONTRACT_NUMBER
    assert by["vendor"].score == WEIGHT_VENDOR
    assert by["amount_fit"].score == WEIGHT_AMOUNT
    assert by["project_reference"].score > 0
    assert score >= WEIGHT_CONTRACT_NUMBER + WEIGHT_VENDOR + WEIGHT_AMOUNT


def test_over_budget_zeroes_amount_signal() -> None:
    c = fake_contract()
    score, signals = score_contract(
        {"contract_reference": "CNT-2025-001"},
        invoice_total=Decimal("1000000"),
        contract=c,
        remaining=Decimal("0"),
    )
    by = {s.name: s for s in signals}
    assert by["amount_fit"].score == 0
    assert "consumed" in by["amount_fit"].note or "unknown" in by["amount_fit"].note


def test_no_signals_returns_zero() -> None:
    c = fake_contract()
    score, _ = score_contract({}, invoice_total=Decimal("0"), contract=c, remaining=Decimal("0"))
    assert score == 0


def test_vendor_name_alone_caps_below_trn_exact() -> None:
    c = fake_contract()
    fields = {"vendor_legal_name": "Al-Manara Contracting Co. LLC"}
    _, signals = score_contract(fields, Decimal("50000"), c, Decimal("500000"))
    by = {s.name: s for s in signals}
    assert by["vendor"].score <= int(WEIGHT_VENDOR * 0.85)


def test_project_fuzzy_match() -> None:
    c = fake_contract(project_name="Riyadh HQ Fit-Out — Phase 1")
    fields = {"project_reference": "Riyadh HQ Fit Out"}
    _, signals = score_contract(fields, Decimal("1"), c, Decimal("1000"))
    by = {s.name: s for s in signals}
    assert 0 < by["project_reference"].score <= WEIGHT_PROJECT
