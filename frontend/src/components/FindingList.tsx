import type { Finding, FindingSeverity } from "@/api/validation";
import { cn } from "@/lib/cn";

const badgeClass: Record<FindingSeverity, string> = {
  blocker: "bg-red-100 text-red-800 border-red-300",
  warning: "bg-amber-100 text-amber-800 border-amber-300",
  info: "bg-blue-100 text-blue-800 border-blue-300",
};

const rowClass: Record<FindingSeverity, string> = {
  blocker: "border-l-4 border-red-500 bg-red-50",
  warning: "border-l-4 border-amber-500 bg-amber-50",
  info: "border-l-4 border-blue-500 bg-blue-50",
};

export function FindingList({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return (
      <p className="rounded border-l-4 border-green-500 bg-green-50 p-3 text-sm text-green-800">
        No findings — all validation checks passed.
      </p>
    );
  }
  return (
    <ul className="space-y-2">
      {findings.map((f) => (
        <li key={f.id} className={cn("rounded px-3 py-2 text-sm", rowClass[f.severity])}>
          <div className="mb-1 flex items-center gap-2">
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] font-mono uppercase",
                badgeClass[f.severity],
              )}
            >
              {f.severity}
            </span>
            <span className="font-mono text-[11px] text-slate-600">{f.rule_code}</span>
          </div>
          <p className="text-slate-800">{f.message}</p>
          {f.reference_json?.suggested_deduction ? (
            <p className="mt-1 text-xs text-slate-600">
              Suggested deduction:{" "}
              <strong>{String(f.reference_json.suggested_deduction)}</strong>
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
