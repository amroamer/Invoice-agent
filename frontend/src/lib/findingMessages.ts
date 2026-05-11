/**
 * Single source of truth for translating backend rule codes into business
 * English. The audit log still persists the raw rule_code — this file is
 * frontend display only.
 *
 * When the backend adds a new rule code, add a message here.
 */

export type FindingContext = {
  reference?: Record<string, unknown> | null;
  message?: string;
};

type Translator = (ctx: FindingContext) => string;

const ref = (ctx: FindingContext) => ctx.reference ?? {};
const s = (v: unknown) => (v === null || v === undefined ? "" : String(v));

export const FINDING_MESSAGES: Record<string, Translator> = {
  arith_line_mismatch: (c) => {
    const line = s(ref(c).line_number);
    return line
      ? `Line ${line} total doesn't match quantity × unit price.`
      : "A line total doesn't match quantity × unit price.";
  },
  arith_subtotal: () => "Subtotal doesn't equal the sum of line totals.",
  arith_vat: (c) => {
    const expected = s(ref(c).expected);
    return expected
      ? `VAT calculation is incorrect — expected ${expected} SAR.`
      : "VAT calculation is incorrect.";
  },
  arith_total: (c) => {
    const expected = s(ref(c).expected);
    return expected
      ? `Total doesn't equal subtotal + VAT — expected ${expected} SAR.`
      : "Total doesn't equal subtotal + VAT.";
  },
  dup_exact: (c) => {
    const ref_inv = s(ref(c).duplicate_invoice_id);
    return ref_inv
      ? "This invoice number already exists for this vendor — possible duplicate disbursement."
      : "This invoice duplicates a previously seen invoice.";
  },
  dup_soft: () =>
    "Same vendor has another invoice of this amount within the last 7 days — check for double billing.",
  unit_price_drift: (c) => {
    const line = s(ref(c).invoice_line_item_id ? ref(c).boq_unit_price : "");
    return line
      ? `Unit price differs from the BoQ (BoQ ${line} SAR).`
      : "Unit price differs from the BoQ.";
  },
  qty_breach: (c) => {
    const boq = s(ref(c).boq_line_number);
    const cap = s(ref(c).boq_quantity);
    const total = s(ref(c).excess_quantity);
    if (boq && cap) {
      return `Cumulative quantity would exceed the BoQ cap on line L${String(boq).padStart(3, "0")} (cap ${cap}, over by ${total}).`;
    }
    return "Cumulative quantity would exceed the BoQ cap.";
  },
  value_breach: (c) => {
    const over = s(ref(c).overage);
    return over
      ? `Cumulative invoiced value would exceed the contract by ${over} SAR.`
      : "Cumulative invoiced value would exceed the contract.";
  },
  date_out_of_window: (c) => {
    const start = s(ref(c).contract_start_date);
    const end = s(ref(c).contract_end_date);
    if (start && end) {
      return `Invoice date is outside the contract period (${start} → ${end}).`;
    }
    return "Invoice date is outside the contract period.";
  },
  vendor_mismatch: (c) => {
    const expected = s(ref(c).contract_vendor_trn);
    return expected
      ? "The invoice's vendor details don't match the contract's vendor."
      : "Vendor details don't match the contract.";
  },
  boq_mapping_missing: (c) => {
    const count = (ref(c).unmapped_line_ids as unknown[] | undefined)?.length ?? 0;
    return count
      ? `${count} invoice line${count === 1 ? "" : "s"} could not be matched to a BoQ line.`
      : "One or more invoice lines aren't mapped to the BoQ.";
  },
};

export function humanizeFinding(ruleCode: string, ctx: FindingContext = {}): string {
  const fn = FINDING_MESSAGES[ruleCode];
  if (fn) return fn(ctx);
  // fallback: use the backend's own message, else humanize the code
  if (ctx.message && ctx.message.trim()) return ctx.message;
  return ruleCode
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Short phrase used in queue tooltips / compact contexts.
 */
export function findingHeadline(ruleCode: string): string {
  const map: Record<string, string> = {
    arith_line_mismatch: "Line total doesn't match",
    arith_subtotal: "Subtotal doesn't add up",
    arith_vat: "VAT calculation is incorrect",
    arith_total: "Total doesn't match",
    dup_exact: "Duplicate invoice number",
    dup_soft: "Possible duplicate billing",
    unit_price_drift: "Unit price drift",
    qty_breach: "Cumulative quantity breach",
    value_breach: "Contract value exceeded",
    date_out_of_window: "Invoice outside contract window",
    vendor_mismatch: "Vendor details don't match",
    boq_mapping_missing: "Unmapped invoice lines",
  };
  return map[ruleCode] ?? ruleCode.replace(/_/g, " ");
}
