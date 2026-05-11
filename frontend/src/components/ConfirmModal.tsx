import { useEffect, useState } from "react";

import { Button } from "@/components/ui/Button";
import { Label } from "@/components/ui/Label";

type Props = {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  requireReason?: boolean;
  reasonPlaceholder?: string;
  loading?: boolean;
  error?: string | null;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
};

export function ConfirmModal({
  open,
  title,
  description,
  confirmLabel,
  confirmVariant = "default",
  requireReason = false,
  reasonPlaceholder,
  loading,
  error,
  onConfirm,
  onCancel,
}: Props) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const disabled = loading || (requireReason && !reason.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-md rounded-lg bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </header>
        <div className="px-5 py-4 text-sm text-slate-700">
          {description}
          {requireReason ? (
            <div className="mt-4">
              <Label>Reason</Label>
              <textarea
                className="mt-1 w-full rounded-md border border-slate-300 bg-white p-2 text-sm"
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={reasonPlaceholder ?? "Brief reason for the audit log…"}
              />
            </div>
          ) : null}
          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </div>
        <footer className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <Button variant="outline" onClick={onCancel} disabled={loading}>
            Cancel
          </Button>
          <Button
            variant={confirmVariant}
            onClick={() => onConfirm(reason.trim())}
            disabled={disabled}
          >
            {loading ? "Working…" : confirmLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}
