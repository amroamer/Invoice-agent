import type { Finding, FindingSeverity } from "@/api/validation";
import { cn } from "@/lib/cn";
import { humanizeFinding } from "@/lib/findingMessages";

const SEVERITY: Record<
  FindingSeverity,
  { bg: string; text: string; border: string; label: string }
> = {
  blocker: {
    bg: "bg-red-50",
    text: "text-red-700",
    border: "border-red-500",
    label: "BLOCKER",
  },
  warning: {
    bg: "bg-amber-50",
    text: "text-amber-800",
    border: "border-amber-500",
    label: "WARNING",
  },
  info: {
    bg: "bg-blue-50",
    text: "text-blue-800",
    border: "border-blue-500",
    label: "INFO",
  },
};

export function FindingRow({
  finding,
  onEvidenceClick,
}: {
  finding: Finding;
  onEvidenceClick?: (f: Finding) => void;
}) {
  const sev = SEVERITY[finding.severity];
  const message = humanizeFinding(finding.rule_code, {
    reference: finding.reference_json,
    message: finding.message,
  });

  const suggestedDeduction = (finding.reference_json as Record<string, unknown> | null)?.[
    "suggested_deduction"
  ];

  return (
    <li
      className={cn("flex gap-3 rounded border-l-4 px-3 py-2", sev.bg, sev.border)}
    >
      <span
        className={cn(
          "flex h-min items-center rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold",
          sev.text,
        )}
      >
        {sev.label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-slate-800">{message}</p>
        {suggestedDeduction ? (
          <p className="mt-1 text-xs text-slate-600">
            Suggested deduction: <strong>{String(suggestedDeduction)} SAR</strong>
          </p>
        ) : null}
        <div className="mt-1 flex items-center gap-3 text-[11px] text-slate-500">
          {onEvidenceClick ? (
            <button
              className="text-brand hover:underline"
              onClick={() => onEvidenceClick(finding)}
            >
              View evidence →
            </button>
          ) : null}
          <span className="font-mono text-slate-400">{finding.rule_code}</span>
        </div>
      </div>
    </li>
  );
}
