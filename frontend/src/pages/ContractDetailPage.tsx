import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { boqCumulative, commitBoq, listBoq, previewBoq, type BoqPreview } from "@/api/boq";
import { getContract } from "@/api/contracts";
import { listHistorical } from "@/api/historical";
import { BoqTable } from "@/components/BoqTable";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader, CardTitle } from "@/components/ui/Card";
import { Label } from "@/components/ui/Label";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";
import { useAuth } from "@/hooks/useAuth";

function money(v: string | null): string {
  if (v === null) return "—";
  const n = Number(v);
  if (Number.isNaN(n)) return v;
  return new Intl.NumberFormat("en-SA", {
    style: "currency",
    currency: "SAR",
    maximumFractionDigits: 2,
  }).format(n);
}

export function ContractDetailPage() {
  const { contractId = "" } = useParams();
  const { me } = useAuth();
  const isAdmin = me?.role === "admin";
  const qc = useQueryClient();

  const contract = useQuery({
    queryKey: ["contract", contractId],
    queryFn: () => getContract(contractId),
    enabled: !!contractId,
  });
  const cumulative = useQuery({
    queryKey: ["boq-cumulative", contractId],
    queryFn: () => boqCumulative(contractId),
    enabled: !!contractId,
  });
  const activeBoq = useQuery({
    queryKey: ["boq-items", contractId],
    queryFn: () => listBoq(contractId),
    enabled: !!contractId,
  });
  const history = useQuery({
    queryKey: ["historical-invoices-contract", contractId],
    queryFn: () => listHistorical(contractId),
    enabled: !!contractId,
  });

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<BoqPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const previewMut = useMutation({
    mutationFn: () => previewBoq(contractId, file!),
    onSuccess: (data) => {
      setPreview(data);
      setPreviewError(null);
    },
    onError: (e: Error) => setPreviewError(e.message),
  });

  const commitMut = useMutation({
    mutationFn: () =>
      commitBoq(
        contractId,
        (preview?.rows ?? []).map((r) => ({
          line_number: r.line_number,
          description: r.description,
          uom: r.uom,
          quantity: r.quantity,
          unit_price: r.unit_price,
          line_total: r.line_total,
        })),
      ),
    onSuccess: () => {
      setPreview(null);
      setFile(null);
      qc.invalidateQueries({ queryKey: ["boq-items", contractId] });
      qc.invalidateQueries({ queryKey: ["boq-cumulative", contractId] });
    },
  });

  if (!contract.data) return <p className="text-slate-500">Loading contract…</p>;
  const c = contract.data;

  return (
    <div>
      <p className="mb-1 text-sm text-slate-500">
        <Link to="/contracts" className="hover:underline">
          Contracts
        </Link>{" "}
        / {c.contract_number}
      </p>
      <h1 className="mb-6 text-2xl font-semibold text-slate-900">{c.contract_number}</h1>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500">Contract value</p>
            <p className="text-xl font-semibold">{money(c.value)}</p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500">Invoiced to date</p>
            <p className="text-xl font-semibold">{money(c.cumulative.invoiced_to_date)}</p>
            <p className="text-xs text-slate-500">
              {c.cumulative.consumed_pct.toFixed(1)}% consumed
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500">Paid to date</p>
            <p className="text-xl font-semibold">{money(c.cumulative.paid_to_date)}</p>
            <p className="text-xs text-slate-500">
              approved-unpaid {money(c.cumulative.approved_unpaid)}
            </p>
          </CardBody>
        </Card>
        <Card>
          <CardBody>
            <p className="text-xs text-slate-500">Remaining budget</p>
            <p className="text-xl font-semibold">{money(c.cumulative.remaining)}</p>
          </CardBody>
        </Card>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Bill of Quantities</CardTitle>
          <p className="mt-1 text-xs text-slate-500">
            {activeBoq.data?.length ?? 0} active line(s). Replacing archives the current BoQ and
            preserves mappings from historical invoices.
          </p>
        </CardHeader>
        <CardBody>
          {isAdmin && (
            <div className="mb-6 rounded border border-dashed border-slate-300 p-4">
              <Label>Upload BoQ (Excel or CSV)</Label>
              <input
                type="file"
                accept=".xlsx,.xlsm,.csv,.tsv"
                className="mt-1 block w-full text-sm"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setPreview(null);
                }}
              />
              <div className="mt-3 flex gap-2">
                <Button
                  size="sm"
                  onClick={() => previewMut.mutate()}
                  disabled={!file || previewMut.isPending}
                >
                  {previewMut.isPending ? "Parsing…" : "Preview"}
                </Button>
                {preview && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => commitMut.mutate()}
                    disabled={preview.row_errors > 0 || commitMut.isPending}
                  >
                    {commitMut.isPending ? "Committing…" : `Commit ${preview.rows.length} lines`}
                  </Button>
                )}
              </div>
              {previewError && <p className="mt-2 text-sm text-red-600">{previewError}</p>}
              {preview && (
                <div className="mt-4 text-xs text-slate-600">
                  <p>
                    Sum of line totals: <strong>{preview.sum_line_total}</strong> vs contract value{" "}
                    <strong>{preview.contract_value ?? "—"}</strong>{" "}
                    <span
                      className={
                        preview.within_tolerance === false ? "text-red-600" : "text-slate-500"
                      }
                    >
                      (tolerance ±{preview.tolerance_pct}%)
                    </span>
                  </p>
                  <p>
                    {preview.row_errors} row(s) with warnings
                    {preview.row_errors > 0 && " — fix the file and re-upload before committing."}
                  </p>
                  <Table className="mt-3">
                    <Thead>
                      <Tr>
                        <Th>#</Th>
                        <Th>Description</Th>
                        <Th>UoM</Th>
                        <Th className="text-right">Qty</Th>
                        <Th className="text-right">Unit price</Th>
                        <Th className="text-right">Line total</Th>
                        <Th>Errors</Th>
                      </Tr>
                    </Thead>
                    <Tbody>
                      {preview.rows.map((r) => (
                        <Tr key={r.line_number}>
                          <Td>{r.line_number}</Td>
                          <Td>{r.description}</Td>
                          <Td>{r.uom}</Td>
                          <Td className="text-right">{r.quantity}</Td>
                          <Td className="text-right">{r.unit_price}</Td>
                          <Td className="text-right">{r.line_total}</Td>
                          <Td className="text-red-600">{r.errors.join("; ")}</Td>
                        </Tr>
                      ))}
                    </Tbody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {cumulative.isLoading ? (
            <p className="text-slate-500">Loading BoQ…</p>
          ) : cumulative.data && cumulative.data.length > 0 ? (
            <BoqTable rows={cumulative.data} />
          ) : (
            <p className="text-slate-500">No BoQ committed yet for this contract.</p>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Invoices on this contract</CardTitle>
        </CardHeader>
        <CardBody>
          {history.data && history.data.length > 0 ? (
            <Table>
              <Thead>
                <Tr>
                  <Th>Invoice #</Th>
                  <Th>Date</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Subtotal</Th>
                  <Th className="text-right">VAT</Th>
                  <Th className="text-right">Total</Th>
                </Tr>
              </Thead>
              <Tbody>
                {history.data.map((inv) => (
                  <Tr key={inv.id}>
                    <Td>{inv.invoice_number}</Td>
                    <Td>{inv.invoice_date}</Td>
                    <Td>{inv.status}</Td>
                    <Td className="text-right">{money(inv.subtotal)}</Td>
                    <Td className="text-right">{money(inv.vat)}</Td>
                    <Td className="text-right">{money(inv.total)}</Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          ) : (
            <p className="text-slate-500">No invoices yet on this contract.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
