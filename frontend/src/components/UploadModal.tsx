import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, CloudUpload, FileText, Info, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";

import { uploadInvoice } from "@/api/invoices";
import { cn } from "@/lib/cn";
import { fileSize } from "@/lib/format";

const ACCEPTED = ".pdf,.png,.jpg,.jpeg,.tiff,.xlsx,.xlsm";
const TYPES: Array<{ key: string; label: string }> = [
  { key: "standard", label: "Standard Invoice" },
  { key: "credit", label: "Credit Note" },
  { key: "debit", label: "Debit Note" },
  { key: "proforma", label: "Proforma Invoice" },
  { key: "other", label: "Other" },
];

export function UploadModal({
  open,
  onClose,
  onUploaded,
}: {
  open: boolean;
  onClose: () => void;
  onUploaded: (invoiceId: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [type, setType] = useState("standard");
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!open) {
      setFile(null);
      setDragOver(false);
      setStep(1);
      setType("standard");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const mutate = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("No file selected");
      return uploadInvoice(file);
    },
    onSuccess: (res) => {
      setStep(3);
      onUploaded(res.invoice_id);
      setTimeout(() => onClose(), 800);
    },
  });

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f) setFile(f);
  }, []);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      onClick={onClose}
      data-testid="upload-modal"
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand">
              <CloudUpload size={16} />
            </span>
            <h2 className="text-base font-semibold text-slate-900">Upload invoice</h2>
          </div>
          <button
            type="button"
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            onClick={onClose}
            aria-label="Close"
            data-testid="upload-close"
          >
            <X size={16} />
          </button>
        </header>

        <Stepper step={step} />

        <div className="p-5">
          {step === 1 && (
            <>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragOver(true);
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                className={cn(
                  "flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition",
                  dragOver ? "border-brand bg-brand-50/40" : "border-brand/30 bg-brand-50/20",
                )}
                data-testid="upload-dropzone"
              >
                <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-50 text-brand">
                  <CloudUpload size={26} />
                </span>
                {file ? (
                  <>
                    <p className="font-medium text-slate-900">{file.name}</p>
                    <p className="mt-1 text-xs text-slate-500">{fileSize(file.size)}</p>
                    <p className="mt-3 text-xs text-brand">Click to choose a different file</p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-slate-900">Drag and drop your invoice here</p>
                    <p className="text-xs text-slate-500">or</p>
                    <span className="mt-1 inline-block rounded-md border border-brand/30 px-3 py-1 text-xs font-medium text-brand">
                      Browse files
                    </span>
                    <p className="mt-3 text-xs text-slate-500">Supported formats: PDF, PNG, JPG, TIFF, or Excel</p>
                    <p className="text-xs text-slate-500">Max file size: 20 MB</p>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  accept={ACCEPTED}
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                  data-testid="upload-input"
                />
              </div>

              <div className="mt-4">
                <p className="mb-2 text-xs font-medium text-slate-700">
                  Invoice type <span className="text-slate-400">(optional)</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {TYPES.map((t) => (
                    <button
                      key={t.key}
                      type="button"
                      onClick={() => setType(t.key)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition",
                        type === t.key
                          ? "border-brand/30 bg-brand-50/70 text-brand"
                          : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
                      )}
                      data-testid={`upload-type-${t.key}`}
                    >
                      {type === t.key && <CheckCircle2 size={12} />} {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex items-start gap-2 rounded-lg border border-brand-50 bg-brand-50/40 px-3 py-2 text-xs text-slate-700">
                <Info size={14} className="mt-0.5 text-brand" />
                We&apos;ll extract data automatically and show you a preview in the next step.
              </div>
            </>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand">
                    <FileText size={18} />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-slate-900">{file?.name ?? "—"}</p>
                    <p className="text-xs text-slate-500">{file ? fileSize(file.size) : ""}</p>
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <dt className="text-slate-500">Invoice type</dt>
                  <dd className="text-right capitalize text-slate-900">{TYPES.find((t) => t.key === type)?.label}</dd>
                </dl>
              </div>
              <p className="text-xs text-slate-500">
                We&apos;ll begin extraction once you submit. You can review and edit the result before deciding.
              </p>
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
              <span className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
                <CheckCircle2 size={24} />
              </span>
              <p className="text-sm font-medium text-slate-900">Invoice uploaded</p>
              <p className="text-xs text-slate-500">Extraction is running in the background.</p>
            </div>
          )}

          {mutate.error ? (
            <p className="mt-3 text-sm text-red-600" data-testid="upload-error">
              {(mutate.error as Error).message}
            </p>
          ) : null}
        </div>

        <footer className="flex items-center justify-between border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            className="text-xs font-medium text-slate-500 hover:text-slate-700"
            onClick={onClose}
            disabled={mutate.isPending}
            data-testid="upload-cancel"
          >
            Cancel
          </button>
          <div className="flex items-center gap-2">
            {step > 1 && step < 3 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s === 2 ? 1 : s))}
                className="rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                data-testid="upload-back"
              >
                Back
              </button>
            )}
            {step === 1 && (
              <button
                type="button"
                onClick={() => setStep(2)}
                disabled={!file}
                className="rounded-md bg-brand-medium px-4 py-2 text-sm font-medium text-white hover:bg-brand disabled:opacity-50"
                data-testid="upload-next"
              >
                Review →
              </button>
            )}
            {step === 2 && (
              <button
                type="button"
                onClick={() => mutate.mutate()}
                disabled={!file || mutate.isPending}
                className="inline-flex items-center gap-2 rounded-md bg-brand-medium px-4 py-2 text-sm font-medium text-white hover:bg-brand disabled:opacity-50"
                data-testid="upload-submit"
              >
                <CloudUpload size={14} /> {mutate.isPending ? "Uploading…" : "Upload"}
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1, label: "Select file" },
    { n: 2, label: "Review" },
    { n: 3, label: "Submit" },
  ];
  return (
    <div className="flex items-center gap-2 border-b border-slate-100 px-5 py-3 text-xs">
      {steps.map((s, i) => (
        <div key={s.n} className="flex items-center gap-2">
          <span
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold",
              step >= s.n ? "bg-brand-medium text-white" : "bg-slate-100 text-slate-500",
            )}
            data-testid={`upload-step-${s.n}`}
          >
            {s.n}
          </span>
          <span
            className={cn(
              "font-medium",
              step >= s.n ? "text-brand" : "text-slate-500",
            )}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && <span className="mx-1 h-px w-8 bg-slate-200" />}
        </div>
      ))}
    </div>
  );
}
