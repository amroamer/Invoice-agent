import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";

import { boqCumulative, listBoq, type BoqItem, type BoqLineCumulative } from "@/api/boq";
import { getContract } from "@/api/contracts";
import { recordDecision } from "@/api/decisions";
import {
  fetchInvoiceFile,
  getExtraction,
  getInvoice,
  reExtract,
  updateInvoice,
  type Extraction,
  type Invoice,
  type InvoiceLineItem,
} from "@/api/invoices";
import {
  applyBoqMapping,
  confirmMatch,
  fetchCandidates,
  proposeBoqMapping,
  unlockMatch,
  type MatchCandidate,
} from "@/api/matching";
import {
  generateRecommendations,
  listRecommendations,
  type Recommendation,
  type Scenario,
} from "@/api/recommendations";
import { recordPayment } from "@/api/payments";
import { listFindings } from "@/api/validation";

import { ConfidencePill } from "@/components/ConfidencePill";
import { ConfirmModal } from "@/components/ConfirmModal";
import { ContractContextStrip } from "@/components/ContractContextStrip";
import { DecisionBanner } from "@/components/DecisionBanner";
import { EvidenceCard } from "@/components/EvidenceCard";
import { FindingRow } from "@/components/FindingRow";
import { OverrideForm } from "@/components/OverrideForm";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { useAuth } from "@/hooks/useAuth";
import { isHighConfidence, levelFor } from "@/lib/confidenceLevel";
import { money } from "@/lib/format";

type FieldSpec = { key: string; label: string; minimal?: boolean };

const FIELDS: FieldSpec[] = [
  { key: "invoice_number", label: "Invoice #", minimal: true },
  { key: "invoice_date", label: "Invoice date", minimal: true },
  { key: "vendor_legal_name", label: "Vendor", minimal: true },
  { key: "vendor_trn", label: "Vendor TRN", minimal: true },
  { key: "buyer_name", label: "Buyer", minimal: true },
  { key: "buyer_trn", label: "Buyer TRN" },
  { key: "currency", label: "Currency" },
  { key: "subtotal", label: "Subtotal", minimal: true },
  { key: "vat_amount", label: "VAT", minimal: true },
  { key: "total", label: "Total", minimal: true },
  { key: "contract_reference", label: "Contract ref", minimal: true },
  { key: "project_reference", label: "Project ref", minimal: true },
  { key: "po_reference", label: "PO reference" },
  { key: "payment_terms", label: "Payment terms" },
];

function confidenceOf(ex: Extraction | null | undefined, key: string): number | null {
  return ex?.confidence_json?.[key] ?? null;
}

function fieldValue(ex: Extraction | null | undefined, key: string): string {
  const raw = ex?.extracted_json?.fields?.[key];
  if (raw == null) return "";
  if (typeof raw === "object") return JSON.stringify(raw);
  return String(raw);
}

function isEmptyOnInvoice(ex: Extraction | null | undefined, key: string): boolean {
  const conf = confidenceOf(ex, key);
  const val = fieldValue(ex, key);
  return (conf === 0 || conf === null) && !val;
}

export function ReviewDecidePage() {
  const { invoiceId = "" } = useParams();
  const navigate = useNavigate();
  const { me } = useAuth();
  const qc = useQueryClient();

  // ── queries ────────────────────────────────────────────────────────────
  const invoice = useQuery({
    queryKey: ["invoice", invoiceId],
    queryFn: () => getInvoice(invoiceId),
    enabled: !!invoiceId,
    refetchOnWindowFocus: false,
  });
  const extraction = useQuery({
    queryKey: ["extraction", invoiceId],
    queryFn: () => getExtraction(invoiceId),
    enabled: !!invoiceId,
    refetchInterval: (q) => (q.state.data ? false : 3000),
  });
  const contract = useQuery({
    queryKey: ["contract", invoice.data?.contract_id ?? ""],
    queryFn: () => getContract(invoice.data!.contract_id!),
    enabled: !!invoice.data?.contract_id,
  });
  const boqItems = useQuery({
    queryKey: ["boq-items", invoice.data?.contract_id ?? ""],
    queryFn: () => listBoq(invoice.data!.contract_id!),
    enabled: !!invoice.data?.contract_id,
  });
  const boqCum = useQuery({
    queryKey: ["boq-cumulative", invoice.data?.contract_id ?? ""],
    queryFn: () => boqCumulative(invoice.data!.contract_id!),
    enabled: !!invoice.data?.contract_id,
  });
  const findings = useQuery({
    queryKey: ["findings", invoiceId],
    queryFn: () => listFindings(invoiceId),
    enabled: !!invoiceId,
  });
  const recs = useQuery({
    queryKey: ["recommendations", invoiceId],
    queryFn: () => listRecommendations(invoiceId),
    enabled: !!invoiceId,
  });

  // ── file preview (blob URL) ────────────────────────────────────────────
  const [fileUrl, setFileUrl] = useState<string>("");
  const [fileType, setFileType] = useState<string>("");
  useEffect(() => {
    if (!invoiceId) return;
    let revoked = false;
    let currentUrl = "";
    fetchInvoiceFile(invoiceId)
      .then(({ blob, contentType }) => {
        if (revoked) return;
        currentUrl = URL.createObjectURL(blob);
        setFileUrl(currentUrl);
        setFileType(contentType);
      })
      .catch(() => setFileUrl(""));
    return () => {
      revoked = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [invoiceId]);

  // ── auto-orchestration: match → BoQ map → recommendation ──────────────
  // Once extraction is ready, run through the stages silently if the signals
  // are high-confidence. The UI lands on the decision without intermediate pages.
  const [orchestrating, setOrchestrating] = useState(false);
  const [orchError, setOrchError] = useState<string | null>(null);
  const [topCandidate, setTopCandidate] = useState<MatchCandidate | null>(null);

  const confirmMatchMut = useMutation({
    mutationFn: ({ id, matchId }: { id: string; matchId: string }) =>
      confirmMatch(id, matchId),
  });
  const proposeMappingMut = useMutation({
    mutationFn: (id: string) => proposeBoqMapping(id),
  });
  const applyMappingMut = useMutation({
    mutationFn: ({ invoiceId, body }: { invoiceId: string; body: Parameters<typeof applyBoqMapping>[1] }) =>
      applyBoqMapping(invoiceId, body),
  });
  const generateMut = useMutation({
    mutationFn: (id: string) => generateRecommendations(id),
  });
  const unlockMut = useMutation({
    mutationFn: unlockMatch,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoice", invoiceId] }),
  });

  useEffect(() => {
    const inv = invoice.data;
    const ex = extraction.data;
    if (!inv || !ex) return;
    if (orchestrating) return;
    // Only orchestrate for uploaded invoices that aren't decided yet.
    if (inv.source !== "uploaded") return;
    if (["decided", "paid", "partially_paid", "rejected"].includes(inv.status)) return;
    if ((recs.data ?? []).length > 0) return;

    let cancelled = false;
    (async () => {
      try {
        setOrchestrating(true);
        setOrchError(null);

        // Step 1 — match
        let contractLocked = !!inv.contract_id;
        if (!contractLocked) {
          const cands = await fetchCandidates(inv.id);
          const top = cands[0];
          setTopCandidate(top ?? null);
          if (top && top.confidence >= 70) {
            await confirmMatchMut.mutateAsync({ id: inv.id, matchId: top.match_id });
            contractLocked = true;
          } else {
            if (cancelled) return;
            setOrchError("Match confidence is low — pick a contract below.");
            return;
          }
        }

        // Step 2 — BoQ mapping
        const fresh = await qc.fetchQuery({
          queryKey: ["invoice", invoiceId],
          queryFn: () => getInvoice(invoiceId),
        });
        const needsMapping = (fresh.line_items ?? []).some(
          (l) => l.boq_item_id == null && !l.not_in_boq,
        );
        if (needsMapping && fresh.contract_id) {
          const suggestions = await proposeMappingMut.mutateAsync(inv.id);
          if (suggestions.length > 0) {
            await applyMappingMut.mutateAsync({
              invoiceId: inv.id,
              body: suggestions,
            });
          }
        }

        // Step 3 — validation + recommendation
        await generateMut.mutateAsync(inv.id);

        if (cancelled) return;
        qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
        qc.invalidateQueries({ queryKey: ["findings", invoiceId] });
        qc.invalidateQueries({ queryKey: ["recommendations", invoiceId] });
      } catch (e) {
        if (!cancelled) setOrchError((e as Error).message);
      } finally {
        if (!cancelled) setOrchestrating(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.data?.id, extraction.data?.id]);

  // ── field editing ──────────────────────────────────────────────────────
  const [values, setValues] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (hydrated) return;
    const inv = invoice.data;
    const ex = extraction.data;
    if (!inv) return;
    const seed: Record<string, string> = {};
    for (const f of FIELDS) seed[f.key] = fieldValue(ex, f.key);
    if (inv.invoice_number && inv.invoice_number !== "PENDING")
      seed.invoice_number = inv.invoice_number;
    if (inv.invoice_date) seed.invoice_date = inv.invoice_date;
    if (Number(inv.subtotal) > 0) seed.subtotal = inv.subtotal;
    if (Number(inv.vat) > 0) seed.vat_amount = inv.vat;
    if (Number(inv.total) > 0) seed.total = inv.total;
    if (inv.currency) seed.currency = inv.currency;
    setValues(seed);
    if (ex || (inv.line_items ?? []).length > 0) setHydrated(true);
  }, [invoice.data, extraction.data, hydrated]);

  const saveFieldMut = useMutation({
    mutationFn: (patch: Partial<typeof values>) =>
      updateInvoice(invoiceId, {
        invoice_number: patch.invoice_number ?? values.invoice_number,
        invoice_date: patch.invoice_date ?? values.invoice_date,
        currency: patch.currency ?? values.currency,
        subtotal: patch.subtotal ?? values.subtotal,
        vat: patch.vat_amount ?? values.vat_amount,
        total: patch.total ?? values.total,
        fields: { ...values, ...patch },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["invoice", invoiceId] }),
  });

  const rerunExtractMut = useMutation({
    mutationFn: () => reExtract(invoiceId),
    onSuccess: () => {
      setHydrated(false);
      qc.invalidateQueries({ queryKey: ["extraction", invoiceId] });
      qc.invalidateQueries({ queryKey: ["recommendations", invoiceId] });
      qc.invalidateQueries({ queryKey: ["findings", invoiceId] });
    },
  });

  // ── decisions / actions ────────────────────────────────────────────────
  const decisionMut = useMutation({
    mutationFn: (args: { scenario: Scenario; reason?: string | null }) =>
      recordDecision(invoiceId, args.scenario, args.reason ?? null),
  });
  const paymentMut = useMutation({
    mutationFn: (amount: number) =>
      recordPayment(invoiceId, {
        amount,
        payment_date: new Date().toISOString().slice(0, 10),
        reference: `UI-APPROVE-${invoice.data?.invoice_number ?? invoiceId.slice(0, 8)}`,
      }),
  });

  // ── derived ────────────────────────────────────────────────────────────
  const chosenRec: Recommendation | undefined = useMemo(() => {
    const rs = recs.data ?? [];
    return (
      rs.find((r) => r.scenario === "happy") ??
      rs.find((r) => r.scenario === "conditional") ??
      rs.find((r) => r.scenario === "do_not_pay")
    );
  }, [recs.data]);

  const bannerScenario: Scenario = chosenRec?.scenario ?? "happy";
  const findingList = findings.data ?? [];
  const deductionRec = (recs.data ?? []).find((r) => r.scenario === "conditional");
  const deduction = deductionRec?.deduction_amount
    ? Number(deductionRec.deduction_amount)
    : 0;

  const thisInvoiceAmount = Number(invoice.data?.total ?? 0);
  const payableAmount =
    bannerScenario === "conditional" && deduction > 0
      ? thisInvoiceAmount - deduction
      : thisInvoiceAmount;

  // ── confirmation modals ────────────────────────────────────────────────
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [holdOpen, setHoldOpen] = useState(false);
  const [clarifyOpen, setClarifyOpen] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  async function runApprove() {
    setActionError(null);
    try {
      await decisionMut.mutateAsync({ scenario: bannerScenario });
      if (bannerScenario !== "do_not_pay") {
        await paymentMut.mutateAsync(payableAmount);
      }
      setApproveOpen(false);
      navigate("/");
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  async function runReject(reason: string) {
    setActionError(null);
    try {
      await decisionMut.mutateAsync({ scenario: "do_not_pay", reason });
      setRejectOpen(false);
      navigate("/");
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  async function runHold(reason: string) {
    // "Hold" isn't a backend scenario; we keep the invoice in the queue and
    // only record an audit line via the normal decision endpoint using
    // conditional + an override reason — but without payment.
    setActionError(null);
    try {
      await decisionMut.mutateAsync({
        scenario: "conditional",
        reason: `HOLD: ${reason}`,
      });
      setHoldOpen(false);
      navigate("/");
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  async function runOverride(scenario: Scenario, reason: string) {
    setActionError(null);
    try {
      await decisionMut.mutateAsync({ scenario, reason });
      if (scenario === "happy" || scenario === "conditional") {
        const amt = scenario === "conditional" ? payableAmount : thisInvoiceAmount;
        await paymentMut.mutateAsync(amt);
      }
      navigate("/");
    } catch (e) {
      setActionError((e as Error).message);
    }
  }

  // ── loading state ──────────────────────────────────────────────────────
  if (!invoice.data) {
    return <p className="text-slate-500">Loading invoice…</p>;
  }
  const inv = invoice.data;

  const extractionDone = !!extraction.data;
  const failedExtract = !!extraction.data?.extracted_json?.error;

  // ── decision banner content ────────────────────────────────────────────
  const vendorName =
    contract.data?.vendor_id && inv.vendor_id
      ? values.vendor_legal_name ||
        fieldValue(extraction.data, "vendor_legal_name") ||
        "the vendor"
      : values.vendor_legal_name || "the vendor";

  const contractSummary = contract.data
    ? `Contract ${contract.data.contract_number} · ${contract.data.cumulative.consumed_pct.toFixed(1)}% consumed · ${money(contract.data.cumulative.remaining)} left`
    : undefined;

  let bannerHeadline = "";
  let bannerBody: React.ReactNode = "";
  let bannerActions: Array<{
    label: string;
    onClick: () => void;
    variant?: "default" | "outline" | "destructive";
  }> = [];

  if (!chosenRec) {
    if (orchestrating || !extractionDone) {
      bannerHeadline = "Reviewing this invoice…";
      bannerBody = extractionDone
        ? "Matching to a contract, mapping BoQ lines, and running validation."
        : "Extracting invoice fields. This page updates automatically.";
    } else {
      bannerHeadline = "Ready for review";
      bannerBody = orchError ?? "Finish reviewing the evidence below to decide.";
    }
  } else if (chosenRec.scenario === "happy") {
    bannerHeadline = `Pay ${money(thisInvoiceAmount)} to ${vendorName}`;
    bannerBody = contractSummary ?? chosenRec.justification;
    bannerActions = [
      { label: "Approve & pay", onClick: () => setApproveOpen(true) },
      { label: "Hold for review", onClick: () => setHoldOpen(true), variant: "outline" },
      { label: "Reject", onClick: () => setRejectOpen(true), variant: "outline" },
    ];
  } else if (chosenRec.scenario === "conditional") {
    const topFinding = findingList[0];
    const ded = chosenRec.deduction_amount ? `${money(Number(chosenRec.deduction_amount))}` : "a deduction";
    bannerHeadline = deduction > 0
      ? `Pay ${money(payableAmount)} to ${vendorName} (deduct ${ded})`
      : `Clarify with ${vendorName} before paying`;
    bannerBody =
      topFinding?.message
        ? `${topFinding.message}${contractSummary ? `\n${contractSummary}` : ""}`
        : chosenRec.justification;
    bannerActions = [
      { label: "Approve with deduction", onClick: () => setApproveOpen(true) },
      { label: "Ask for clarification", onClick: () => setClarifyOpen(true), variant: "outline" },
      { label: "Reject", onClick: () => setRejectOpen(true), variant: "outline" },
    ];
  } else {
    bannerHeadline = "Do not pay this invoice";
    bannerBody = chosenRec.justification || "One or more blocking issues prevent payment.";
    bannerActions = [
      { label: "Reject with reason", onClick: () => setRejectOpen(true), variant: "destructive" },
      { label: "Hold for review", onClick: () => setHoldOpen(true), variant: "outline" },
    ];
  }

  // ── evidence card summaries / open-state hints ─────────────────────────
  const extractionScores = Object.values(extraction.data?.confidence_json ?? {}).filter(
    (v): v is number => typeof v === "number",
  );
  const extractionFieldCount = Object.keys(extraction.data?.confidence_json ?? {}).length;
  const extractionAllHigh = isHighConfidence(extractionScores);

  const lineItems = inv.line_items ?? [];
  const unmappedLines = lineItems.filter((l) => !l.boq_item_id && !l.not_in_boq).length;
  const notInBoqCount = lineItems.filter((l) => l.not_in_boq).length;
  const blockerCount = findingList.filter((f) => f.severity === "blocker").length;
  const warningCount = findingList.filter((f) => f.severity === "warning").length;

  const contractInfoSummary = contract.data
    ? `Matched to ${contract.data.contract_number}${inv.vendor_id ? ` — ${vendorName}` : ""}`
    : topCandidate
      ? `Top candidate: ${topCandidate.contract_number} (${topCandidate.confidence}%)`
      : "No candidates yet";

  const boqMappingSummary = unmappedLines > 0
    ? `${unmappedLines} invoice line${unmappedLines === 1 ? "" : "s"} not mapped`
    : notInBoqCount > 0
      ? `${notInBoqCount} line${notInBoqCount === 1 ? "" : "s"} marked "not in BoQ"`
      : `${lineItems.length} invoice line${lineItems.length === 1 ? "" : "s"} mapped to BoQ`;

  const extractionSummary = failedExtract
    ? "Extraction failed — retry or enter manually"
    : extractionFieldCount > 0
      ? `${extractionFieldCount} fields extracted · ${extractionAllHigh ? "all high confidence" : "review recommended"}`
      : "Waiting for extraction…";

  // ── contract context numbers (all from the same endpoint to avoid drift) ─
  const ctxContractValue = Number(contract.data?.value ?? 0);
  const ctxInvoiced = Number(contract.data?.cumulative.invoiced_to_date ?? 0);
  const ctxPaid = Number(contract.data?.cumulative.paid_to_date ?? 0);
  const ctxApprovedUnpaid = Number(contract.data?.cumulative.approved_unpaid ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-1 text-sm text-slate-500">
          <Link to="/" className="hover:underline">Invoices</Link> / {values.invoice_number || inv.invoice_number}
        </p>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-slate-900">
            {values.invoice_number || inv.invoice_number}
          </h1>
          <Link to="/" className="text-sm text-slate-500 hover:text-slate-700 hover:underline">
            ← Back to queue
          </Link>
        </div>
      </div>

      {failedExtract ? (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          Extraction failed: {String(extraction.data?.extracted_json?.error)}
          <Button
            size="sm"
            variant="secondary"
            className="ml-3"
            onClick={() => rerunExtractMut.mutate()}
            disabled={rerunExtractMut.isPending}
          >
            Re-extract
          </Button>
        </div>
      ) : null}

      <DecisionBanner
        scenario={bannerScenario}
        headline={bannerHeadline}
        body={bannerBody}
        actions={bannerActions}
      />

      {contract.data ? (
        <ContractContextStrip
          contractValue={ctxContractValue}
          invoicedToDate={ctxInvoiced}
          paid={ctxPaid}
          approvedUnpaid={ctxApprovedUnpaid}
          thisInvoice={thisInvoiceAmount}
        />
      ) : null}

      {/* ── Evidence card — extraction ────────────────────────────── */}
      <EvidenceCard
        title="Extracted invoice"
        summary={extractionSummary}
        level={extractionAllHigh ? 100 : 70}
        defaultOpen={failedExtract ? true : !extractionAllHigh}
      >
        <ExtractionPane
          invoice={inv}
          extraction={extraction.data ?? null}
          fileUrl={fileUrl}
          fileType={fileType}
          values={values}
          setValues={setValues}
          onBlur={(key) => saveFieldMut.mutate({ [key]: values[key] })}
          onRerun={() => rerunExtractMut.mutate()}
          rerunPending={rerunExtractMut.isPending}
        />
      </EvidenceCard>

      {/* ── Evidence card — match ────────────────────────────────── */}
      <EvidenceCard
        title="Contract match"
        summary={contractInfoSummary}
        level={
          contract.data
            ? 100
            : topCandidate
              ? topCandidate.confidence
              : 0
        }
        defaultOpen={!contract.data}
      >
        <MatchPane
          invoiceId={inv.id}
          lockedContractId={inv.contract_id ?? null}
          onUnlock={
            me?.role === "admin"
              ? () => unlockMut.mutate(inv.id)
              : undefined
          }
        />
      </EvidenceCard>

      {/* ── Evidence card — BoQ mapping ──────────────────────────── */}
      {inv.contract_id ? (
        <EvidenceCard
          title="BoQ line mapping"
          summary={boqMappingSummary}
          level={unmappedLines > 0 ? 50 : notInBoqCount > 0 ? 80 : 100}
          tone={unmappedLines > 0 || blockerCount > 0 ? "warning" : "ok"}
          defaultOpen={unmappedLines > 0 || blockerCount > 0}
        >
          <BoqMappingPane
            lineItems={lineItems}
            boqItems={boqItems.data ?? []}
            boqCumulative={boqCum.data ?? []}
          />
        </EvidenceCard>
      ) : null}

      {/* ── Findings ─────────────────────────────────────────────── */}
      {findingList.length > 0 ? (
        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-baseline justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              {blockerCount + warningCount} issue{blockerCount + warningCount === 1 ? "" : "s"} found
            </h3>
            <span className="text-xs text-slate-500">
              {blockerCount} blocker{blockerCount === 1 ? "" : "s"} · {warningCount} warning
              {warningCount === 1 ? "" : "s"}
            </span>
          </div>
          <ul className="space-y-2">
            {findingList.map((f) => (
              <FindingRow key={f.id} finding={f} />
            ))}
          </ul>
        </section>
      ) : null}

      {/* ── Override ─────────────────────────────────────────────── */}
      <OverrideForm
        onSubmit={runOverride}
        submitting={decisionMut.isPending || paymentMut.isPending}
        error={actionError}
      />

      {/* ── Confirmation modals ──────────────────────────────────── */}
      <ConfirmModal
        open={approveOpen}
        title={bannerScenario === "conditional" ? "Approve with deduction" : "Approve & pay"}
        description={
          <>
            <p>
              This will record the decision and a payment of <strong>{money(payableAmount)}</strong>{" "}
              for {vendorName}. The action is permanent and logged in the audit trail.
            </p>
            {deduction > 0 ? (
              <p className="mt-2 text-xs text-slate-600">
                Deducting {money(deduction)} from the {money(thisInvoiceAmount)} invoice total.
              </p>
            ) : null}
          </>
        }
        confirmLabel={bannerScenario === "conditional" ? "Approve with deduction" : "Approve & pay"}
        loading={decisionMut.isPending || paymentMut.isPending}
        error={actionError}
        onConfirm={runApprove}
        onCancel={() => setApproveOpen(false)}
      />
      <ConfirmModal
        open={rejectOpen}
        title="Reject this invoice"
        description="The decision and your reason will be logged. No payment will be made."
        confirmLabel="Reject"
        confirmVariant="destructive"
        requireReason
        reasonPlaceholder="e.g. duplicate of INV-2025-0123 already paid"
        loading={decisionMut.isPending}
        error={actionError}
        onConfirm={runReject}
        onCancel={() => setRejectOpen(false)}
      />
      <ConfirmModal
        open={holdOpen}
        title="Hold for review"
        description="The invoice stays in the queue. Your reason is logged."
        confirmLabel="Hold"
        requireReason
        reasonPlaceholder="e.g. waiting on timesheet confirmation"
        loading={decisionMut.isPending}
        error={actionError}
        onConfirm={runHold}
        onCancel={() => setHoldOpen(false)}
      />
      <ClarifyModal
        open={clarifyOpen}
        email={deductionRec?.clarification_email ?? ""}
        onClose={() => setClarifyOpen(false)}
      />
    </div>
  );
}

// ── sub-components ─────────────────────────────────────────────────────────

function ExtractionPane({
  invoice,
  extraction,
  fileUrl,
  fileType,
  values,
  setValues,
  onBlur,
  onRerun,
  rerunPending,
}: {
  invoice: Invoice;
  extraction: Extraction | null;
  fileUrl: string;
  fileType: string;
  values: Record<string, string>;
  setValues: (v: Record<string, string>) => void;
  onBlur: (key: string) => void;
  onRerun: () => void;
  rerunPending: boolean;
}) {
  const [showAll, setShowAll] = useState(false);
  const visibleFields = useMemo(
    () =>
      FIELDS.filter((f) => f.minimal || showAll || !isEmptyOnInvoice(extraction, f.key)),
    [showAll, extraction],
  );

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <div className="order-2 lg:order-1">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {visibleFields.map((f) => {
            const conf = confidenceOf(extraction, f.key);
            const level = levelFor(conf);
            const empty = isEmptyOnInvoice(extraction, f.key);
            return (
              <div key={f.key}>
                <div className="flex items-center justify-between">
                  <Label htmlFor={`f-${f.key}`}>{f.label}</Label>
                  {empty ? (
                    <span className="text-[11px] text-slate-400">Not present on invoice</span>
                  ) : (
                    <ConfidencePill score={conf} hideWhenEmpty />
                  )}
                </div>
                <Input
                  id={`f-${f.key}`}
                  className={level === "review" ? "border-amber-400" : level === "low" ? "border-red-400" : ""}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
                  onBlur={() => onBlur(f.key)}
                />
              </div>
            );
          })}
        </div>
        <div className="mt-3 flex items-center justify-between text-xs">
          <button
            className="text-brand hover:underline"
            onClick={() => setShowAll((x) => !x)}
          >
            {showAll ? "Hide secondary fields" : "Show all fields"}
          </button>
          <button
            className="text-slate-500 hover:text-slate-700 hover:underline disabled:opacity-50"
            onClick={onRerun}
            disabled={rerunPending}
          >
            {rerunPending ? "Re-extracting…" : "Re-extract"}
          </button>
        </div>

        {invoice.line_items.length > 0 ? (
          <div className="mt-6">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Line items
            </h4>
            <Table>
              <Thead>
                <Tr>
                  <Th>#</Th>
                  <Th>Description</Th>
                  <Th>UoM</Th>
                  <Th className="text-right">Qty</Th>
                  <Th className="text-right">Unit price</Th>
                  <Th className="text-right">Line total</Th>
                </Tr>
              </Thead>
              <Tbody>
                {invoice.line_items.map((l) => (
                  <Tr key={l.id}>
                    <Td>{l.line_number ?? "—"}</Td>
                    <Td>{l.description}</Td>
                    <Td>{l.uom ?? "—"}</Td>
                    <Td className="text-right">{l.quantity}</Td>
                    <Td className="text-right">{l.unit_price}</Td>
                    <Td className="text-right">{l.line_total}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </div>
        ) : null}
      </div>
      <div className="order-1 lg:order-2">
        <div className="overflow-hidden rounded border border-slate-200 bg-slate-50">
          {fileUrl ? (
            fileType.startsWith("image/") ? (
              <img
                src={fileUrl}
                alt="invoice"
                className="max-h-[600px] w-full object-contain"
              />
            ) : (
              <iframe src={fileUrl} className="h-[600px] w-full border-0" title="invoice source" />
            )
          ) : (
            <p className="p-6 text-sm text-slate-500">Loading file…</p>
          )}
        </div>
      </div>
    </div>
  );
}

function MatchPane({
  invoiceId,
  lockedContractId,
  onUnlock,
}: {
  invoiceId: string;
  lockedContractId: string | null;
  onUnlock?: () => void;
}) {
  const [candidates, setCandidates] = useState<MatchCandidate[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDetail, setShowDetail] = useState<Record<string, boolean>>({});
  const qc = useQueryClient();
  const fetchMut = useMutation({
    mutationFn: () => fetchCandidates(invoiceId),
    onSuccess: (data) => {
      setCandidates(data);
      setSelected(data[0]?.match_id ?? null);
      setError(null);
    },
    onError: (e: Error) => setError(e.message),
  });
  const confirmMut = useMutation({
    mutationFn: (matchId: string) => confirmMatch(invoiceId, matchId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["invoice", invoiceId] });
    },
  });

  useEffect(() => {
    if (!lockedContractId && candidates == null && !fetchMut.isPending) {
      fetchMut.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lockedContractId]);

  if (lockedContractId) {
    return (
      <div className="text-sm text-slate-700">
        <p>
          Locked to contract <code className="rounded bg-slate-100 px-1">{lockedContractId.slice(0, 8)}…</code>.
        </p>
        {onUnlock ? (
          <button
            className="mt-3 text-xs text-slate-500 hover:text-red-600 hover:underline"
            onClick={onUnlock}
          >
            Unlock (admin)
          </button>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      {fetchMut.isPending ? <p className="text-sm text-slate-500">Scoring candidates…</p> : null}
      {(candidates ?? []).map((c) => (
        <div
          key={c.match_id}
          className={`rounded border-2 p-3 ${selected === c.match_id ? "border-brand bg-brand/5" : "border-slate-200"}`}
          onClick={() => setSelected(c.match_id)}
          role="button"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-semibold text-slate-900">{c.contract_number}</p>
              <p className="text-xs text-slate-500">
                {c.project_name} · {c.vendor_name}
              </p>
            </div>
            <ConfidencePill score={c.confidence} />
          </div>
          <p className="mt-2 text-sm text-slate-700">
            {matchWhy(c)}
          </p>
          <button
            className="mt-2 text-[11px] text-slate-500 hover:underline"
            onClick={(e) => {
              e.stopPropagation();
              setShowDetail((x) => ({ ...x, [c.match_id]: !x[c.match_id] }));
            }}
          >
            {showDetail[c.match_id] ? "Hide scoring detail" : "Show scoring detail"}
          </button>
          {showDetail[c.match_id] ? (
            <ul className="mt-2 space-y-1 text-[11px] text-slate-500">
              {c.signals.map((s) => (
                <li key={s.name}>
                  <span className="font-mono">{s.score}/{s.weight}</span> · {s.name} — {s.note}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ))}
      <div className="flex gap-2">
        <Button
          onClick={() => selected && confirmMut.mutate(selected)}
          disabled={!selected || confirmMut.isPending}
        >
          {confirmMut.isPending ? "Confirming…" : "Confirm match"}
        </Button>
        <Button
          variant="outline"
          onClick={() => fetchMut.mutate()}
          disabled={fetchMut.isPending}
        >
          Re-run matching
        </Button>
      </div>
    </div>
  );
}

function matchWhy(c: MatchCandidate): string {
  const bits: string[] = [];
  const byName = Object.fromEntries(c.signals.map((s) => [s.name, s]));
  if ((byName.contract_number?.score ?? 0) >= byName.contract_number?.weight) {
    bits.push("exact contract number match");
  } else if ((byName.contract_number?.score ?? 0) > 0) {
    bits.push("partial contract number match");
  }
  if ((byName.vendor?.score ?? 0) >= byName.vendor?.weight) {
    bits.push("vendor TRN match");
  } else if ((byName.vendor?.score ?? 0) > 0) {
    bits.push("vendor name match");
  }
  if ((byName.project_reference?.score ?? 0) > 0) bits.push("project reference match");
  if ((byName.amount_fit?.score ?? 0) >= byName.amount_fit?.weight) {
    bits.push("amount fits remaining budget");
  } else if ((byName.amount_fit?.score ?? 0) === 0) {
    bits.push("amount exceeds remaining budget");
  }
  if (!bits.length) return "No strong signal on this candidate.";
  return bits[0].charAt(0).toUpperCase() + bits[0].slice(1) + (bits.length > 1 ? ", " + bits.slice(1).join(", ") : "") + ".";
}

function BoqMappingPane({
  lineItems,
  boqItems,
  boqCumulative,
}: {
  lineItems: InvoiceLineItem[];
  boqItems: BoqItem[];
  boqCumulative: BoqLineCumulative[];
}) {
  const boqById = new Map<string, BoqItem>();
  for (const b of boqItems) boqById.set(b.id, b);
  const cumById = new Map<string, BoqLineCumulative>();
  for (const c of boqCumulative) cumById.set(c.id, c);

  return (
    <Table>
      <Thead>
        <Tr>
          <Th>Invoice line</Th>
          <Th>Matched BoQ line</Th>
          <Th>UoM / qty</Th>
          <Th>Notes</Th>
        </Tr>
      </Thead>
      <Tbody>
        {lineItems.map((l) => {
          const boq = l.boq_item_id ? boqById.get(l.boq_item_id) : null;
          const cum = l.boq_item_id ? cumById.get(l.boq_item_id) : null;
          return (
            <Tr key={l.id} className={l.not_in_boq ? "bg-amber-50" : ""}>
              <Td>
                <p className="text-sm font-medium text-slate-800">{l.description}</p>
                <p className="text-[11px] text-slate-500">
                  qty {l.quantity} · unit {l.unit_price}
                </p>
              </Td>
              <Td>
                {boq ? (
                  <>
                    <p className="text-sm text-slate-800">{boq.description}</p>
                    <p className="text-[11px] text-slate-500">Line {boq.line_number}</p>
                  </>
                ) : (
                  <span className="text-xs text-amber-700">Not in BoQ — clarification may be needed</span>
                )}
              </Td>
              <Td>
                {boq ? (
                  <span className="text-xs">
                    {boq.uom} · consumed {cum?.consumed_pct?.toFixed(1) ?? "0"}%
                  </span>
                ) : (
                  "—"
                )}
              </Td>
              <Td>
                {cum && cum.color === "red" ? (
                  <span className="text-xs text-red-700">BoQ cap exceeded</span>
                ) : cum && cum.color === "yellow" ? (
                  <span className="text-xs text-amber-700">Near BoQ cap</span>
                ) : null}
              </Td>
            </Tr>
          );
        })}
      </Tbody>
    </Table>
  );
}

function ClarifyModal({
  open,
  email,
  onClose,
}: {
  open: boolean;
  email: string;
  onClose: () => void;
}) {
  if (!open) return null;
  async function copy() {
    await navigator.clipboard.writeText(email);
  }
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">Clarification email</h2>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="max-h-[60vh] overflow-auto px-5 py-4">
          <pre className="whitespace-pre-wrap font-sans text-sm text-slate-700">
            {email || "No clarification email was drafted."}
          </pre>
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button onClick={copy} disabled={!email}>
            Copy to clipboard
          </Button>
        </footer>
      </div>
    </div>
  );
}
