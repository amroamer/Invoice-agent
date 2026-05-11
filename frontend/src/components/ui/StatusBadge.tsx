import { cn } from "@/lib/cn";

export type StatusTone =
  | "pending"
  | "ready"
  | "attention"
  | "paid"
  | "rejected"
  | "processing"
  | "neutral"
  | "active"
  | "compliant"
  | "review"
  | "noncompliant"
  | "highrisk"
  | "mediumrisk"
  | "lowrisk";

const palette: Record<StatusTone, { bg: string; fg: string; dot: string }> = {
  pending: { bg: "bg-blue-50", fg: "text-blue-700", dot: "bg-blue-500" },
  ready: { bg: "bg-emerald-50", fg: "text-emerald-700", dot: "bg-emerald-500" },
  attention: { bg: "bg-amber-50", fg: "text-amber-800", dot: "bg-amber-500" },
  paid: { bg: "bg-emerald-50", fg: "text-emerald-700", dot: "bg-emerald-500" },
  rejected: { bg: "bg-red-50", fg: "text-red-700", dot: "bg-red-500" },
  processing: { bg: "bg-slate-100", fg: "text-slate-700", dot: "bg-slate-500" },
  neutral: { bg: "bg-slate-100", fg: "text-slate-700", dot: "bg-slate-400" },
  active: { bg: "bg-emerald-50", fg: "text-emerald-700", dot: "bg-emerald-500" },
  compliant: { bg: "bg-emerald-50", fg: "text-emerald-700", dot: "bg-emerald-500" },
  review: { bg: "bg-amber-50", fg: "text-amber-800", dot: "bg-amber-500" },
  noncompliant: { bg: "bg-red-50", fg: "text-red-700", dot: "bg-red-500" },
  highrisk: { bg: "bg-red-50", fg: "text-red-700", dot: "bg-red-500" },
  mediumrisk: { bg: "bg-amber-50", fg: "text-amber-800", dot: "bg-amber-500" },
  lowrisk: { bg: "bg-emerald-50", fg: "text-emerald-700", dot: "bg-emerald-500" },
};

type Props = {
  tone: StatusTone;
  children: React.ReactNode;
  withDot?: boolean;
  className?: string;
};

export function StatusBadge({ tone, children, withDot = true, className }: Props) {
  const c = palette[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        c.bg,
        c.fg,
        className,
      )}
    >
      {withDot && <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} aria-hidden />}
      {children}
    </span>
  );
}
