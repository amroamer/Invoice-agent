import type { ReactNode } from "react";

import { cn } from "@/lib/cn";
import { Sparkline } from "@/components/ui/Sparkline";

export type KpiTone = "neutral" | "brand" | "success" | "warning" | "danger" | "violet" | "amber";

const tone: Record<KpiTone, { bg: string; ring: string; iconBg: string; iconFg: string; value: string }> = {
  neutral: {
    bg: "bg-white",
    ring: "ring-slate-200",
    iconBg: "bg-slate-100",
    iconFg: "text-slate-700",
    value: "text-slate-900",
  },
  brand: {
    bg: "bg-white",
    ring: "ring-brand/20",
    iconBg: "bg-brand-50",
    iconFg: "text-brand",
    value: "text-brand",
  },
  success: {
    bg: "bg-white",
    ring: "ring-emerald-200",
    iconBg: "bg-emerald-50",
    iconFg: "text-emerald-700",
    value: "text-emerald-700",
  },
  warning: {
    bg: "bg-white",
    ring: "ring-amber-200",
    iconBg: "bg-amber-50",
    iconFg: "text-amber-700",
    value: "text-amber-700",
  },
  amber: {
    bg: "bg-white",
    ring: "ring-amber-200",
    iconBg: "bg-amber-50",
    iconFg: "text-amber-700",
    value: "text-amber-700",
  },
  danger: {
    bg: "bg-white",
    ring: "ring-red-200",
    iconBg: "bg-red-50",
    iconFg: "text-red-700",
    value: "text-red-700",
  },
  violet: {
    bg: "bg-white",
    ring: "ring-violet-200",
    iconBg: "bg-violet-50",
    iconFg: "text-violet-700",
    value: "text-violet-700",
  },
};

type DeltaDirection = "up" | "down" | "flat";

type Props = {
  label: string;
  value: ReactNode;
  tone?: KpiTone;
  icon?: ReactNode;
  delta?: {
    direction: DeltaDirection;
    label: string;
  };
  trend?: number[];
  active?: boolean;
  onClick?: () => void;
  className?: string;
  description?: ReactNode;
  testId?: string;
};

export function KpiCard({
  label,
  value,
  tone: t = "neutral",
  icon,
  delta,
  trend,
  active,
  onClick,
  className,
  description,
  testId,
}: Props) {
  const styles = tone[t];
  const Component = onClick ? "button" : "div";

  const trendColor =
    t === "danger"
      ? "#EF4444"
      : t === "success"
        ? "#10B981"
        : t === "warning" || t === "amber"
          ? "#F59E0B"
          : t === "violet"
            ? "#7C3AED"
            : "#005EB8";

  return (
    <Component
      onClick={onClick}
      data-testid={testId}
      className={cn(
        "group flex flex-col gap-3 rounded-xl p-5 text-left shadow-card ring-1 transition",
        "hover:shadow-cardHover",
        styles.bg,
        styles.ring,
        onClick && "cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-brand",
        active && "ring-2 ring-brand/40",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</p>
        {icon && (
          <span className={cn("flex h-9 w-9 items-center justify-center rounded-lg", styles.iconBg, styles.iconFg)}>
            {icon}
          </span>
        )}
      </div>
      <div className="flex items-end justify-between gap-2">
        <p className={cn("text-3xl font-semibold leading-none tracking-tight", styles.value)}>{value}</p>
        {trend && trend.length > 1 && (
          <Sparkline data={trend} color={trendColor} className="opacity-90" />
        )}
      </div>
      {(delta || description) && (
        <div className="flex items-center gap-2 text-xs">
          {delta && (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 font-medium",
                delta.direction === "up" && "text-emerald-700",
                delta.direction === "down" && "text-red-700",
                delta.direction === "flat" && "text-slate-500",
              )}
            >
              {delta.direction === "up" && (
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <path d="M5 1 L9 7 L1 7 Z" fill="currentColor" />
                </svg>
              )}
              {delta.direction === "down" && (
                <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
                  <path d="M5 9 L1 3 L9 3 Z" fill="currentColor" />
                </svg>
              )}
              {delta.direction === "flat" && <span className="font-bold">—</span>}
              {delta.label}
            </span>
          )}
          {description && <span className="text-slate-500">{description}</span>}
        </div>
      )}
    </Component>
  );
}
