import { useMemo } from "react";

type Props = {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  className?: string;
  ariaLabel?: string;
};

export function Sparkline({
  data,
  width = 72,
  height = 28,
  color = "#005EB8",
  className,
  ariaLabel,
}: Props) {
  const path = useMemo(() => {
    if (data.length < 2) return "";
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const step = width / (data.length - 1);
    return data
      .map((v, i) => {
        const x = i * step;
        const y = height - ((v - min) / range) * height;
        return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
  }, [data, width, height]);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={className}
      role="img"
      aria-label={ariaLabel}
    >
      <path d={path} stroke={color} strokeWidth={1.75} fill="none" strokeLinecap="round" />
    </svg>
  );
}
