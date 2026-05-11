import { cn } from "@/lib/cn";

type Props = {
  contractValue: number;
  paid: number;
  approvedUnpaid: number;
  thisInvoice: number;
  className?: string;
};

function pct(a: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, (a / total) * 100));
}

export function ContractProgressBar({
  contractValue,
  paid,
  approvedUnpaid,
  thisInvoice,
  className,
}: Props) {
  const paidPct = pct(paid, contractValue);
  const apprPct = pct(approvedUnpaid, contractValue);
  const thisPct = pct(thisInvoice, contractValue);
  const usedPct = Math.min(100, paidPct + apprPct + thisPct);
  const remainingPct = Math.max(0, 100 - usedPct);
  const overflow = paid + approvedUnpaid + thisInvoice > contractValue;

  return (
    <div className={className}>
      <div className="flex h-3 w-full overflow-hidden rounded bg-slate-200">
        <div
          className={cn("bg-green-600", overflow && "bg-red-600")}
          style={{ width: `${paidPct}%` }}
          title={`Paid: ${paid}`}
        />
        <div
          className={cn("bg-amber-500", overflow && "bg-red-500")}
          style={{ width: `${apprPct}%` }}
          title={`Approved-unpaid: ${approvedUnpaid}`}
        />
        <div
          className={cn("bg-brand", overflow && "bg-red-400")}
          style={{ width: `${thisPct}%` }}
          title={`This invoice: ${thisInvoice}`}
        />
        <div
          className="bg-slate-300"
          style={{ width: `${remainingPct}%` }}
          title="Remaining"
        />
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2 text-[11px] text-slate-600">
        <span><span className="inline-block h-2 w-2 rounded-sm bg-green-600 mr-1 align-middle"/>Paid</span>
        <span><span className="inline-block h-2 w-2 rounded-sm bg-amber-500 mr-1 align-middle"/>Approved-unpaid</span>
        <span><span className="inline-block h-2 w-2 rounded-sm bg-brand mr-1 align-middle"/>This invoice</span>
        <span><span className="inline-block h-2 w-2 rounded-sm bg-slate-300 mr-1 align-middle"/>Remaining</span>
      </div>
    </div>
  );
}
