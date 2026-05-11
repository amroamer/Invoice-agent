import { useState, type ReactNode } from "react";

import { cn } from "@/lib/cn";
import { levelFor, type ConfidenceLevel } from "@/lib/confidenceLevel";
import { ConfidencePill } from "@/components/ConfidencePill";

const BORDER: Record<ConfidenceLevel, string> = {
  high: "border-slate-200",
  review: "border-amber-300",
  low: "border-red-300",
  none: "border-slate-200",
};

export function EvidenceCard({
  title,
  summary,
  level: levelOverride,
  defaultOpen,
  children,
  extraHeader,
  tone,
}: {
  title: string;
  summary: ReactNode;
  level?: ConfidenceLevel | number | null;
  defaultOpen?: boolean;
  children: ReactNode;
  extraHeader?: ReactNode;
  tone?: "ok" | "warning" | "error";
}) {
  const resolvedLevel: ConfidenceLevel =
    typeof levelOverride === "number"
      ? levelFor(levelOverride)
      : (levelOverride as ConfidenceLevel | undefined) ?? "high";

  // If defaultOpen is not specified, open for low-confidence or warnings.
  const shouldOpen =
    typeof defaultOpen === "boolean"
      ? defaultOpen
      : resolvedLevel !== "high" || tone === "warning" || tone === "error";

  const [open, setOpen] = useState(shouldOpen);
  const toneBorder =
    tone === "error"
      ? "border-red-300"
      : tone === "warning"
        ? "border-amber-300"
        : BORDER[resolvedLevel];

  return (
    <section
      className={cn(
        "overflow-hidden rounded-lg border bg-white shadow-sm transition",
        toneBorder,
      )}
    >
      <header
        className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3"
        onClick={() => setOpen((x) => !x)}
        role="button"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
            {resolvedLevel !== "none" && typeof levelOverride !== "undefined" ? (
              <ConfidencePill
                score={
                  typeof levelOverride === "number"
                    ? levelOverride
                    : resolvedLevel === "high"
                      ? 100
                      : resolvedLevel === "review"
                        ? 80
                        : 50
                }
              />
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">{summary}</p>
        </div>
        <div className="flex items-center gap-2">
          {extraHeader}
          <span className="text-slate-400" aria-hidden>
            {open ? "▾" : "▸"}
          </span>
        </div>
      </header>
      {open ? (
        <div className="border-t border-slate-100 px-5 py-4">{children}</div>
      ) : null}
    </section>
  );
}
