import { cn } from "@/lib/cn";

export function ConfidenceBadge({
  score,
  threshold = 70,
}: {
  score: number | null | undefined;
  threshold?: number;
}) {
  const v = typeof score === "number" ? score : 0;
  const band =
    v === 0 ? "zero" : v < threshold ? "low" : v < 85 ? "med" : "high";
  const cls: Record<string, string> = {
    high: "bg-green-100 text-green-800",
    med: "bg-slate-100 text-slate-700",
    low: "bg-amber-100 text-amber-800",
    zero: "bg-red-100 text-red-800",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-mono",
        cls[band],
      )}
      title={`confidence ${v}%`}
    >
      {v}%
    </span>
  );
}
