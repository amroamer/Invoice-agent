import { cn } from "@/lib/cn";

export type QueueStatus =
  | "processing"
  | "ready"
  | "needs_attention"
  | "do_not_pay"
  | "decided"
  | "paid"
  | "partially_paid"
  | "rejected";

const STYLES: Record<QueueStatus, { bg: string; text: string; dot: string; glyph: string; label: string }> = {
  processing: {
    bg: "bg-slate-100",
    text: "text-slate-700",
    dot: "bg-slate-400",
    glyph: "…",
    label: "Processing",
  },
  ready: {
    bg: "bg-green-100",
    text: "text-green-800",
    dot: "bg-green-600",
    glyph: "✓",
    label: "Ready to approve",
  },
  needs_attention: {
    bg: "bg-amber-100",
    text: "text-amber-800",
    dot: "bg-amber-500",
    glyph: "⚠",
    label: "Needs attention",
  },
  do_not_pay: {
    bg: "bg-red-100",
    text: "text-red-800",
    dot: "bg-red-500",
    glyph: "✕",
    label: "Do not pay",
  },
  decided: {
    bg: "bg-blue-100",
    text: "text-blue-800",
    dot: "bg-blue-500",
    glyph: "✓",
    label: "Awaiting payment",
  },
  paid: {
    bg: "bg-green-50",
    text: "text-green-700",
    dot: "bg-green-500",
    glyph: "✓",
    label: "Paid",
  },
  partially_paid: {
    bg: "bg-amber-50",
    text: "text-amber-700",
    dot: "bg-amber-400",
    glyph: "◐",
    label: "Partially paid",
  },
  rejected: {
    bg: "bg-red-50",
    text: "text-red-700",
    dot: "bg-red-500",
    glyph: "✕",
    label: "Rejected",
  },
};

export function StatusPill({
  status,
  className,
  tooltip,
}: {
  status: QueueStatus;
  className?: string;
  tooltip?: string;
}) {
  const s = STYLES[status];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
        s.bg,
        s.text,
        className,
      )}
      title={tooltip ?? s.label}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
      {s.label}
    </span>
  );
}
