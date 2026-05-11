import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

type Props = {
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  className?: string;
};

export function PageHeader({ eyebrow, title, description, status, actions, className }: Props) {
  return (
    <header
      className={cn(
        "relative overflow-hidden rounded-2xl bg-hero-strong px-6 py-7 ring-1 ring-slate-200",
        className,
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 top-1/2 hidden h-64 w-[520px] -translate-y-1/2 opacity-70 lg:block"
        style={{
          background:
            "radial-gradient(closest-side, rgba(0,145,218,0.18), rgba(0,51,141,0.08) 60%, rgba(255,255,255,0) 80%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-6 top-3 hidden text-brand/15 lg:block"
      >
        <svg width="380" height="120" viewBox="0 0 380 120" fill="none">
          {Array.from({ length: 28 }).map((_, i) => {
            const x = 8 + i * 13;
            const h = 30 + ((i * 37) % 70);
            return (
              <rect
                key={i}
                x={x}
                y={120 - h}
                width="6"
                height={h}
                rx="1"
                fill="currentColor"
              />
            );
          })}
          <path
            d="M2 80 L60 70 L110 88 L160 60 L220 72 L280 48 L340 58 L378 40"
            stroke="currentColor"
            strokeOpacity="0.4"
            strokeWidth="1.5"
            fill="none"
          />
        </svg>
      </div>
      <div className="relative flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-1.5">
          {eyebrow && (
            <p className="text-xs font-semibold uppercase tracking-wider text-brand">{eyebrow}</p>
          )}
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900">{title}</h1>
          {description && <p className="max-w-2xl text-sm text-slate-600">{description}</p>}
          {status && <div className="pt-1">{status}</div>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
