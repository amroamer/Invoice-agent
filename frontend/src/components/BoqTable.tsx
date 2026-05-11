import type { BoqLineCumulative } from "@/api/boq";
import { cn } from "@/lib/cn";
import { Table, Tbody, Td, Th, Thead, Tr } from "@/components/ui/Table";

const colorClass: Record<BoqLineCumulative["color"], string> = {
  green: "bg-green-50",
  yellow: "bg-amber-50",
  red: "bg-red-50",
};

const dotClass: Record<BoqLineCumulative["color"], string> = {
  green: "bg-severity-ok",
  yellow: "bg-severity-warning",
  red: "bg-severity-blocker",
};

export function BoqTable({
  rows,
  onLineClick,
}: {
  rows: BoqLineCumulative[];
  onLineClick?: (row: BoqLineCumulative) => void;
}) {
  return (
    <Table>
      <Thead>
        <Tr>
          <Th>#</Th>
          <Th>Description</Th>
          <Th>UoM</Th>
          <Th className="text-right">Qty</Th>
          <Th className="text-right">Unit price</Th>
          <Th className="text-right">Line total</Th>
          <Th className="text-right">Invoiced qty</Th>
          <Th className="text-right">Remaining qty</Th>
          <Th className="text-right">Consumed %</Th>
        </Tr>
      </Thead>
      <Tbody>
        {rows.map((r) => (
          <Tr
            key={r.id}
            className={cn(
              colorClass[r.color],
              onLineClick && "cursor-pointer",
            )}
            onClick={() => onLineClick?.(r)}
          >
            <Td className="font-mono text-xs">{r.line_number}</Td>
            <Td>{r.description}</Td>
            <Td>{r.uom}</Td>
            <Td className="text-right">{r.original_quantity}</Td>
            <Td className="text-right">{r.original_unit_price}</Td>
            <Td className="text-right">{r.original_line_total}</Td>
            <Td className="text-right">{r.cumulative_quantity_invoiced}</Td>
            <Td className="text-right">{r.remaining_quantity}</Td>
            <Td className="text-right">
              <span
                className={cn(
                  "inline-block h-2 w-2 rounded-full mr-2 align-middle",
                  dotClass[r.color],
                )}
              />
              {r.consumed_pct.toFixed(1)}%
            </Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );
}
