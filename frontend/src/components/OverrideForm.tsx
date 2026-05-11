import { useState } from "react";

import type { Scenario } from "@/api/recommendations";
import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";

export function OverrideForm({
  onSubmit,
  submitting,
  error,
}: {
  onSubmit: (scenario: Scenario, reason: string) => void;
  submitting?: boolean;
  error?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const [scenario, setScenario] = useState<Scenario>("happy");
  const [reason, setReason] = useState("");

  if (!open) {
    return (
      <div className="mt-8 text-center">
        <button
          onClick={() => setOpen(true)}
          className="text-xs text-slate-500 hover:text-slate-700 hover:underline"
        >
          Override the recommendation
        </button>
      </div>
    );
  }

  return (
    <section className="mt-8 rounded-lg border border-slate-200 bg-slate-50 p-5">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-900">Override the recommendation</h3>
        <button
          className="text-xs text-slate-500 hover:text-slate-700"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-600">
        Override is exceptional. The reason you enter is recorded in the audit log and
        reviewed by compliance.
      </p>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <Label>Decision</Label>
          <select
            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-sm"
            value={scenario}
            onChange={(e) => setScenario(e.target.value as Scenario)}
          >
            <option value="happy">Pay as-is</option>
            <option value="conditional">Pay with deduction</option>
            <option value="do_not_pay">Reject</option>
          </select>
        </div>
        <div>
          <Label>Reason (required)</Label>
          <textarea
            className="w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
            rows={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why does the proposed recommendation not fit?"
          />
        </div>
      </div>
      {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
      <div className="mt-3 flex justify-end">
        <Button
          onClick={() => onSubmit(scenario, reason.trim())}
          disabled={submitting || !reason.trim()}
          variant="destructive"
        >
          {submitting ? "Recording…" : "Record override"}
        </Button>
      </div>
    </section>
  );
}
