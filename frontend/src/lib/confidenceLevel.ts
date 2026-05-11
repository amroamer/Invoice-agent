/**
 * Translate a 0-100 confidence score into a traffic-light level.
 * The raw percentage is kept only for tooltips and audit; the UI shows
 * high/review/low.
 */

export type ConfidenceLevel = "high" | "review" | "low" | "none";

export function levelFor(score: number | null | undefined): ConfidenceLevel {
  if (score === null || score === undefined) return "none";
  if (score >= 90) return "high";
  if (score >= 70) return "review";
  if (score > 0) return "low";
  return "none";
}

export function worstLevel(scores: Array<number | null | undefined>): ConfidenceLevel {
  const present = scores.filter((s): s is number => typeof s === "number" && s > 0);
  if (present.length === 0) return "none";
  const min = Math.min(...present);
  return levelFor(min);
}

export function isHighConfidence(scores: Array<number | null | undefined>): boolean {
  const present = scores.filter((s): s is number => typeof s === "number" && s > 0);
  if (present.length === 0) return false;
  return Math.min(...present) >= 90;
}

export function levelLabel(level: ConfidenceLevel): string {
  switch (level) {
    case "high":
      return "High";
    case "review":
      return "Review";
    case "low":
      return "Low";
    case "none":
      return "—";
  }
}
