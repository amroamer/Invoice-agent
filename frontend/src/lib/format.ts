const SAR = new Intl.NumberFormat("en-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 0,
});

const SAR_PRECISE = new Intl.NumberFormat("en-SA", {
  style: "currency",
  currency: "SAR",
  maximumFractionDigits: 2,
});

const NUM = new Intl.NumberFormat("en-US");

export function money(v: string | number | null | undefined, precise = false): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  return (precise ? SAR_PRECISE : SAR).format(n);
}

export function moneyShort(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  if (Math.abs(n) >= 1_000_000) return `SAR ${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000) return `SAR ${(n / 1_000).toFixed(0)}K`;
  return SAR.format(n);
}

export function num(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (Number.isNaN(n)) return String(v);
  return NUM.format(n);
}

export function fileSize(bytes: number): string {
  if (!bytes || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 10) return "<0.01 MB";
  if (kb < 1024) return `${(kb / 1024).toFixed(2)} MB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function relativeTime(iso: string): string {
  const date = new Date(iso);
  const diffMs = Date.now() - date.getTime();
  const s = Math.round(diffMs / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  return date.toLocaleDateString();
}

export function shortDate(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
