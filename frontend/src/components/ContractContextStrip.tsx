import { ContractProgressBar } from "@/components/ContractProgressBar";
import { money } from "@/lib/format";

type Props = {
  contractValue: number;
  invoicedToDate: number;
  paid: number;
  approvedUnpaid: number;
  thisInvoice: number;
};

export function ContractContextStrip({
  contractValue,
  invoicedToDate,
  paid,
  approvedUnpaid,
  thisInvoice,
}: Props) {
  const remaining = Math.max(0, contractValue - invoicedToDate - thisInvoice);
  return (
    <section className="rounded-lg bg-white px-6 py-4 shadow-sm ring-1 ring-slate-200">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Contract value" value={money(contractValue)} />
        <Stat label="Invoiced to date" value={money(invoicedToDate)} />
        <Stat label="This invoice" value={money(thisInvoice)} />
        <Stat label="Remaining" value={money(remaining)} />
      </div>
      <ContractProgressBar
        className="mt-4"
        contractValue={contractValue}
        paid={paid}
        approvedUnpaid={approvedUnpaid}
        thisInvoice={thisInvoice}
      />
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900">{value}</p>
    </div>
  );
}
