import { useMemo } from "react";

export type DonutSegment = {
  label: string;
  value: number;
  color: string;
};

type Props = {
  segments: DonutSegment[];
  size?: number;
  thickness?: number;
  centerPrimary?: string | number;
  centerSecondary?: string;
  className?: string;
};

export function Donut({
  segments,
  size = 160,
  thickness = 18,
  centerPrimary,
  centerSecondary,
  className,
}: Props) {
  const total = segments.reduce((a, s) => a + s.value, 0) || 1;
  const r = (size - thickness) / 2;
  const c = size / 2;
  const circumference = 2 * Math.PI * r;

  const arcs = useMemo(() => {
    let offset = 0;
    return segments.map((s) => {
      const fraction = s.value / total;
      const length = fraction * circumference;
      const arc = {
        color: s.color,
        dasharray: `${length} ${circumference - length}`,
        dashoffset: -offset,
      };
      offset += length;
      return arc;
    });
  }, [segments, total, circumference]);

  return (
    <div className={className} style={{ width: size, height: size, position: "relative" }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Status breakdown">
        <circle cx={c} cy={c} r={r} fill="none" stroke="#F1F5F9" strokeWidth={thickness} />
        {arcs.map((a, i) => (
          <circle
            key={i}
            cx={c}
            cy={c}
            r={r}
            fill="none"
            stroke={a.color}
            strokeWidth={thickness}
            strokeDasharray={a.dasharray}
            strokeDashoffset={a.dashoffset}
            transform={`rotate(-90 ${c} ${c})`}
            strokeLinecap="butt"
          />
        ))}
      </svg>
      {(centerPrimary !== undefined || centerSecondary) && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
        >
          {centerPrimary !== undefined && (
            <p className="text-2xl font-semibold text-slate-900">{centerPrimary}</p>
          )}
          {centerSecondary && (
            <p className="text-xs text-slate-500">{centerSecondary}</p>
          )}
        </div>
      )}
    </div>
  );
}
