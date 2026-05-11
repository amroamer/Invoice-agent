import os
from dataclasses import dataclass
from decimal import Decimal
from types import SimpleNamespace
from uuid import uuid4

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://app:app@localhost:5432/test")
os.environ.setdefault("JWT_SECRET", "test-secret")

from app.models.enums import FindingSeverity, Scenario  # noqa: E402
from app.services.recommendation import synthesize  # noqa: E402


@dataclass
class FakeFinding:
    rule_code: str
    severity: FindingSeverity
    message: str
    reference_json: dict | None = None
    id: object = None

    def __post_init__(self) -> None:
        self.id = uuid4()


def fake_invoice():
    return SimpleNamespace(
        total=Decimal("1150.00"),
        currency="SAR",
        invoice_number="INV-1",
        invoice_date="2026-03-01",
    )


def test_clean_invoice_yields_happy_path_only() -> None:
    scenarios = synthesize(fake_invoice(), findings=[])
    assert len(scenarios) == 1
    assert scenarios[0].scenario == Scenario.happy


def test_warning_only_yields_conditional_without_deduction() -> None:
    findings = [
        FakeFinding(
            rule_code="dup_soft",
            severity=FindingSeverity.warning,
            message="near duplicate",
        )
    ]
    scenarios = synthesize(fake_invoice(), findings)
    labels = [s.scenario for s in scenarios]
    assert Scenario.conditional in labels
    assert Scenario.happy not in labels
    cond = next(s for s in scenarios if s.scenario == Scenario.conditional)
    assert cond.deduction_amount is None
    assert cond.clarification_email is not None


def test_recoverable_blocker_yields_conditional_with_deduction() -> None:
    findings = [
        FakeFinding(
            rule_code="qty_breach",
            severity=FindingSeverity.blocker,
            message="qty breach",
            reference_json={"suggested_deduction": "250.00"},
        )
    ]
    scenarios = synthesize(fake_invoice(), findings)
    cond = next(s for s in scenarios if s.scenario == Scenario.conditional)
    assert cond.deduction_amount == Decimal("250.00")


def test_non_recoverable_blocker_forces_do_not_pay_only() -> None:
    findings = [
        FakeFinding(
            rule_code="dup_exact",
            severity=FindingSeverity.blocker,
            message="exact duplicate",
        )
    ]
    scenarios = synthesize(fake_invoice(), findings)
    labels = [s.scenario for s in scenarios]
    assert Scenario.do_not_pay in labels
    assert Scenario.happy not in labels
    assert Scenario.conditional not in labels


def test_mixed_blockers_still_excludes_happy() -> None:
    findings = [
        FakeFinding(
            rule_code="qty_breach",
            severity=FindingSeverity.blocker,
            message="recoverable",
            reference_json={"suggested_deduction": "100.00"},
        ),
        FakeFinding(
            rule_code="date_out_of_window",
            severity=FindingSeverity.blocker,
            message="out of window",
        ),
    ]
    scenarios = synthesize(fake_invoice(), findings)
    labels = [s.scenario for s in scenarios]
    assert Scenario.do_not_pay in labels
    assert Scenario.happy not in labels
    # Conditional is suppressed when a non-recoverable blocker is present.
    assert Scenario.conditional not in labels
