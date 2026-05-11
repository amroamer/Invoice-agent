import { cn } from "@/lib/cn";

type Segment = {
  value: number;
  color: string;
  label?: string;
};

type Props = {
  segments?: Segment[];
  value?: number;
  total?: number;
  color?: string;
  height?: number;
  className?: string;
  ariaLabel?: string;
};

export function ProgressBar({
  segments,
  value,
  total = 100,
  color = "#005EB8",
  height = 8,
  className,
  ariaLabel,
}: Props) {
  if (segments && segments.length > 0) {
    const sum = segments.reduce((a, s) => a + s.value, 0) || 1;
    return (
      <div
        role="progressbar"
        aria-label={ariaLabel}
        className={cn("flex w-full overflow-hidden rounded-full bg-slate-100", className)}
        style={{ height }}
      >
        {segments.map((s, i) => (
          <div
            key={i}
            className="h-full"
            style={{ width: `${(s.value / sum) * 100}%`, background: s.color }}
            title={s.label}
          />
        ))}
      </div>
    );
  }
  const pct = Math.min(100, Math.max(0, ((value ?? 0) / total) * 100));
  return (
    <div
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("w-full overflow-hidden rounded-full bg-slate-100", className)}
      style={{ height }}
    >
      <div className="h-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}
