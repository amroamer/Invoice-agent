import type { Recommendation, Scenario } from "@/api/recommendations";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/cn";

const cardClass: Record<Scenario, string> = {
  happy: "border-green-400",
  conditional: "border-amber-400",
  do_not_pay: "border-red-400",
};

const labelClass: Record<Scenario, string> = {
  happy: "bg-green-100 text-green-800",
  conditional: "bg-amber-100 text-amber-800",
  do_not_pay: "bg-red-100 text-red-800",
};

const labelText: Record<Scenario, string> = {
  happy: "Happy Path",
  conditional: "Conditional",
  do_not_pay: "Do Not Pay",
};

export function ScenarioCard({
  rec,
  selected,
  onSelect,
}: {
  rec: Recommendation;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      className={cn(
        "flex h-full flex-col border-2 transition",
        selected ? "ring-2 ring-brand ring-offset-1" : cardClass[rec.scenario],
      )}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "rounded px-2 py-0.5 text-xs font-semibold uppercase",
              labelClass[rec.scenario],
            )}
          >
            {labelText[rec.scenario]}
          </span>
          <span className="rounded bg-brand px-2 py-1 text-xs font-mono text-white">
            {rec.confidence}%
          </span>
        </div>
        <CardTitle className="mt-2 text-base">
          {rec.scenario === "conditional" && rec.deduction_amount
            ? `Pay with ${rec.deduction_amount} deduction`
            : rec.scenario === "conditional"
              ? "Pay after clarification"
              : rec.scenario === "happy"
                ? "Pay as-is"
                : "Reject payment"}
        </CardTitle>
      </CardHeader>
      <CardBody className="flex-1">
        <div className="whitespace-pre-wrap text-sm text-slate-800">{rec.justification}</div>
        {rec.clarification_email && (
          <details className="mt-4 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
            <summary className="cursor-pointer font-medium">Draft clarification email</summary>
            <pre className="mt-2 whitespace-pre-wrap font-sans text-slate-700">
              {rec.clarification_email}
            </pre>
          </details>
        )}
        <div className="mt-4">
          <Button
            className="w-full"
            variant={selected ? "default" : "outline"}
            onClick={onSelect}
          >
            {selected ? "Selected" : "Select this scenario"}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
}
