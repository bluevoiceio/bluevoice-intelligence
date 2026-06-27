import type { AgencyHealth, HealthSummary } from "@/lib/health";

/**
 * Deterministic, templated weekly brief. No LLM — the richer narrative is
 * produced on demand by Claude Code (see the design spec, §2). Uses a real
 * minus sign (−) for negative percentages to match the UI.
 */

function pct(a: AgencyHealth): string {
  if (a.deltaPct == null) return "new";
  const rounded = Math.round(a.deltaPct);
  const sign = rounded < 0 ? "−" : "+";
  return `${sign}${Math.abs(rounded)}%`;
}

function list(agencies: AgencyHealth[]): string {
  return agencies.map((a) => `${a.department} (${pct(a)})`).join(", ");
}

function names(agencies: AgencyHealth[]): string {
  const ns = agencies.map((a) => a.department);
  if (ns.length === 1) return ns[0];
  if (ns.length === 2) return `${ns[0]} and ${ns[1]}`;
  return `${ns.slice(0, -1).join(", ")}, and ${ns[ns.length - 1]}`;
}

export function generateBrief(summary: HealthSummary): string {
  const sentences: string[] = [];

  if (summary.atRiskCount > 0) {
    const noun = summary.atRiskCount === 1 ? "agency needs" : "agencies need";
    sentences.push(`${summary.atRiskCount} ${noun} attention this week.`);
    if (summary.topDecliners.length > 0) {
      sentences.push(`Biggest drops: ${list(summary.topDecliners.slice(0, 3))}.`);
    }
  } else {
    sentences.push("No agencies crossed the decline threshold this period.");
  }

  if (summary.topNew.length > 0) {
    const verb = summary.topNew.length === 1 ? "is" : "are";
    sentences.push(`${names(summary.topNew.slice(0, 3))} ${verb} ramping fast as new activations.`);
  } else if (summary.topRisers.length > 0) {
    sentences.push(`Fastest growth: ${list(summary.topRisers.slice(0, 3))}.`);
  }

  const top = summary.topStateShare[0];
  if (top) {
    sentences.push(`${top.state} remains the largest market (${Math.round(top.pct)}% of usage).`);
  }

  return sentences.join(" ");
}
