from decimal import Decimal
from uuid import UUID

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models.boq_item import BoqItem
from app.models.contract import Contract
from app.models.enums import InvoiceStatus
from app.models.invoice import Invoice
from app.models.invoice_line_item import InvoiceLineItem
from app.models.payment import Payment


def _active_invoice_filter(contract_id: UUID, exclude_invoice_id: UUID | None):
    conds = [Invoice.contract_id == contract_id, Invoice.archived.is_(False)]
    if exclude_invoice_id is not None:
        conds.append(Invoice.id != exclude_invoice_id)
    return and_(*conds)


def contract_cumulative(
    db: Session, contract_id: UUID, exclude_invoice_id: UUID | None = None
) -> dict:
    contract = db.get(Contract, contract_id)
    if not contract:
        raise ValueError(f"Contract {contract_id} not found")

    invoices = list(
        db.scalars(select(Invoice).where(_active_invoice_filter(contract_id, exclude_invoice_id)))
    )
    invoiced = sum((inv.total for inv in invoices), Decimal("0"))
    approved = sum(
        (
            inv.total
            for inv in invoices
            if inv.status
            in {InvoiceStatus.decided, InvoiceStatus.paid, InvoiceStatus.partially_paid}
        ),
        Decimal("0"),
    )

    if invoices:
        payments_sum = db.scalar(
            select(func.coalesce(func.sum(Payment.amount), 0)).where(
                Payment.invoice_id.in_([inv.id for inv in invoices])
            )
        ) or Decimal("0")
    else:
        payments_sum = Decimal("0")
    paid = Decimal(payments_sum)

    approved_unpaid = max(approved - paid, Decimal("0"))
    remaining = contract.value - invoiced
    consumed_pct = float((invoiced / contract.value) * 100) if contract.value else 0.0

    return {
        "invoiced_to_date": invoiced,
        "paid_to_date": paid,
        "approved_unpaid": approved_unpaid,
        "remaining": remaining,
        "consumed_pct": round(consumed_pct, 2),
    }


def color_band(consumed_pct: float) -> str:
    if consumed_pct > 100.0:
        return "red"
    if consumed_pct >= 80.0:
        return "yellow"
    return "green"


def boq_lines_cumulative(
    db: Session, contract_id: UUID, exclude_invoice_id: UUID | None = None
) -> list[dict]:
    """Return per-BoQ-line cumulative figures for a contract.

    Paid amount for a line is proportionally allocated from the invoice's total
    payments: `line_total / invoice.total * sum(payments)`.
    """
    items: list[BoqItem] = list(
        db.scalars(
            select(BoqItem)
            .where(BoqItem.contract_id == contract_id, BoqItem.active.is_(True))
            .order_by(BoqItem.line_number)
        )
    )
    if not items:
        return []

    invoice_filter = _active_invoice_filter(contract_id, exclude_invoice_id)

    # Aggregate per-line quantity and amount across non-archived invoices.
    qty_amt_rows = db.execute(
        select(
            InvoiceLineItem.boq_item_id,
            func.coalesce(func.sum(InvoiceLineItem.quantity), 0).label("qty"),
            func.coalesce(func.sum(InvoiceLineItem.line_total), 0).label("amt"),
        )
        .join(Invoice, Invoice.id == InvoiceLineItem.invoice_id)
        .where(invoice_filter, InvoiceLineItem.boq_item_id.is_not(None))
        .group_by(InvoiceLineItem.boq_item_id)
    ).all()
    qty_by_line: dict[UUID, Decimal] = {r.boq_item_id: Decimal(r.qty) for r in qty_amt_rows}
    amt_by_line: dict[UUID, Decimal] = {r.boq_item_id: Decimal(r.amt) for r in qty_amt_rows}

    # Payments allocated proportionally per invoice line.
    paid_rows = db.execute(
        select(
            InvoiceLineItem.boq_item_id,
            func.coalesce(
                func.sum(
                    InvoiceLineItem.line_total
                    / func.nullif(Invoice.total, 0)
                    * func.coalesce(_payments_subq(), 0)
                ),
                0,
            ).label("paid"),
        )
        .join(Invoice, Invoice.id == InvoiceLineItem.invoice_id)
        .where(invoice_filter, InvoiceLineItem.boq_item_id.is_not(None))
        .group_by(InvoiceLineItem.boq_item_id)
    ).all()
    paid_by_line: dict[UUID, Decimal] = {r.boq_item_id: Decimal(r.paid or 0) for r in paid_rows}

    out: list[dict] = []
    for item in items:
        invoiced_qty = qty_by_line.get(item.id, Decimal("0"))
        invoiced_amt = amt_by_line.get(item.id, Decimal("0"))
        paid_amt = paid_by_line.get(item.id, Decimal("0"))
        remaining_qty = item.quantity - invoiced_qty
        remaining_value = item.line_total - invoiced_amt
        consumed_pct = (
            float((invoiced_qty / item.quantity) * 100) if item.quantity else 0.0
        )
        out.append(
            {
                "id": item.id,
                "line_number": item.line_number,
                "description": item.description,
                "uom": item.uom,
                "original_quantity": item.quantity,
                "original_unit_price": item.unit_price,
                "original_line_total": item.line_total,
                "cumulative_quantity_invoiced": invoiced_qty,
                "cumulative_amount_invoiced": invoiced_amt.quantize(Decimal("0.01")),
                "cumulative_amount_paid": paid_amt.quantize(Decimal("0.01")),
                "remaining_quantity": remaining_qty,
                "remaining_value": remaining_value.quantize(Decimal("0.01")),
                "consumed_pct": round(consumed_pct, 2),
                "color": color_band(consumed_pct),
            }
        )
    return out


def _payments_subq():
    """Correlated subquery returning sum of Payment.amount per invoice row.

    Kept as a function to avoid circular imports and so the FROM clause stays tidy.
    """
    return (
        select(func.coalesce(func.sum(Payment.amount), 0))
        .where(Payment.invoice_id == Invoice.id)
        .correlate(Invoice)
        .scalar_subquery()
    )
