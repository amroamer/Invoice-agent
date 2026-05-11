import { cn } from "@/lib/cn";
import { levelFor, levelLabel, type ConfidenceLevel } from "@/lib/confidenceLevel";

const BASE =
  "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium";

const CLS: Record<ConfidenceLevel, string> = {
  high: "bg-green-100 text-green-800",
  review: "bg-amber-100 text-amber-800",
  low: "bg-red-100 text-red-800",
  none: "bg-slate-100 text-slate-600",
};

const GLYPH: Record<ConfidenceLevel, string> = {
  high: "✓",
  review: "⚠",
  low: "✕",
  none: "·",
};

export function ConfidencePill({
  score,
  hideWhenEmpty = false,
  className,
}: {
  score: number | null | undefined;
  hideWhenEmpty?: boolean;
  className?: string;
}) {
  const level = levelFor(score);
  if (level === "none" && hideWhenEmpty) return null;
  const label = levelLabel(level);
  const tooltip =
    typeof score === "number" && score > 0 ? `${score}% confidence` : "No signal";
  return (
    <span className={cn(BASE, CLS[level], className)} title={tooltip}>
      <span aria-hidden>{GLYPH[level]}</span>
      {label}
    </span>
  );
}
