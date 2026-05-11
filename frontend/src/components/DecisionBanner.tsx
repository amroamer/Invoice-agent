import type { Scenario } from "@/api/recommendations";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

type BannerAction = {
  label: string;
  onClick: () => void;
  variant?: "default" | "outline" | "destructive";
  loading?: boolean;
  disabled?: boolean;
};

type Props = {
  scenario: Scenario;
  headline: string;
  body: string | React.ReactNode;
  actions: BannerAction[];
};

const TONE: Record<Scenario, { bg: string; border: string; badge: string; glyph: string; label: string }> = {
  happy: {
    bg: "bg-green-50",
    border: "border-green-300",
    badge: "bg-green-600 text-white",
    glyph: "✓",
    label: "Ready to approve",
  },
  conditional: {
    bg: "bg-amber-50",
    border: "border-amber-300",
    badge: "bg-amber-500 text-white",
    glyph: "⚠",
    label: "Pay with deduction",
  },
  do_not_pay: {
    bg: "bg-red-50",
    border: "border-red-300",
    badge: "bg-red-600 text-white",
    glyph: "✕",
    label: "Do not pay",
  },
};

export function DecisionBanner({ scenario, headline, body, actions }: Props) {
  const tone = TONE[scenario];
  return (
    <section
      className={cn("rounded-lg border-2 px-6 py-5 shadow-sm", tone.bg, tone.border)}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-xl font-bold",
            tone.badge,
          )}
          aria-hidden
        >
          {tone.glyph}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-600">
            {tone.label}
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-900">{headline}</h2>
          <div className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{body}</div>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        {actions.map((a, i) => (
          <Button
            key={a.label}
            variant={a.variant ?? (i === 0 ? "default" : "outline")}
            onClick={a.onClick}
            disabled={a.disabled || a.loading}
          >
            {a.loading ? "Working…" : a.label}
          </Button>
        ))}
      </div>
    </section>
  );
}
