import type { AccountIntelligence, IntelligenceResponse } from "@/lib/intelligence";
import type { TrendSeries } from "@/lib/amplitude-parse";
import { sumByState, topShare, topMovers, type Mover } from "@/lib/charts";
import { fmt, fmtCompact, fmtPct } from "@/lib/format";

/** Deterministic narration for the briefing. Pure — no React, no I/O. The
 *  thesis is chosen by data-guarded rules (never hardcoded); every number is
 *  read from the response. Unit tested in lib/__tests__/narrative.test.ts. */

export type { Mover };

export interface BookSignals {
  total: number;
  atRisk: number;
  atRiskShare: number;
  medianHealth: number;
  questionVolume: number;
  volumeDeltaPct: number | null;
  risers: number;
  decliners: number;
  premiumReachPct: number;
  topState: { state: string; share: number } | null;
  window: number;
}

export interface StatLine {
  value: string;
  label: string;
}

export interface Narrative {
  thesis: string;
  verdict: string;
  coverStats: StatLine[];
  act1: string;
  act2: string;
  act3: string;
  movers: { risers: Mover[]; fallers: Mover[] };
}

const HIGH_VOLUME = 3000; // book-wide questions that qualify as "deep adoption"

/** An account counts as reaching premium if it uses Workspace or Redaction. */
function usesPremium(a: AccountIntelligence): boolean {
  return (a.pillars?.workspace ?? 0) > 0 || (a.pillars?.redaction ?? 0) > 0;
}

export function deriveSignals(data: IntelligenceResponse): BookSignals {
  const accounts = data.accounts;
  const total = data.summary.total;
  const atRisk = data.summary.bands.red;

  const composites = accounts.map((a) => a.composite).sort((x, y) => x - y);
  const medianHealth = composites.length ? composites[Math.floor(composites.length / 2)] : 0;

  const questionVolume = data.featureTotals?.questions ?? accounts.reduce((s, a) => s + a.current, 0);
  const priorVolume = accounts.reduce((s, a) => s + a.prior, 0);
  const currentVolume = accounts.reduce((s, a) => s + a.current, 0);
  const volumeDeltaPct = priorVolume > 0 ? (currentVolume - priorVolume) / priorVolume : null;

  const risers = accounts.filter((a) => a.status === "riser").length;
  const decliners = accounts.filter((a) => a.status === "decliner").length;
  const premiumReachPct = total ? accounts.filter(usesPremium).length / total : 0;

  const states = sumByState(accounts);
  const stateTotal = states.reduce((s, x) => s + x.value, 0);
  const topState = states.length && stateTotal > 0 ? { state: states[0].state, share: states[0].value / stateTotal } : null;

  return {
    total, atRisk, atRiskShare: total ? atRisk / total : 0, medianHealth,
    questionVolume, volumeDeltaPct, risers, decliners, premiumReachPct, topState,
    window: data.window ?? 30,
  };
}

/** Window-aware phrasing — 90d compares quarter-over-quarter, everything shorter is monthly. */
function periodWords(window: number): { mom: string; period: string; rate: string } {
  return window >= 90
    ? { mom: "quarter-over-quarter", period: "this quarter", rate: "/ qtr" }
    : { mom: "month-over-month", period: "this month", rate: "/ mo" };
}

interface ThesisRule {
  when: (s: BookSignals) => boolean;
  thesis: string;
  verdict: (s: BookSignals) => string;
}

/** Ordered candidate theses — the first satisfied rule wins. Editorial framing
 *  is authored here; the DATA decides which one fires, so the headline updates
 *  when the book changes and never overstates what its guard doesn't support. */
const THESES: ThesisRule[] = [
  {
    when: (s) => s.atRiskShare > 0.4 || s.medianHealth < 45,
    thesis: "The book is softening.",
    verdict: (s) =>
      `${fmt(s.atRisk)} departments are at risk and the median scores ${s.medianHealth}/100 — retention is the story ${periodWords(s.window).period}.`,
  },
  {
    when: (s) => s.premiumReachPct < 0.1 && s.questionVolume > HIGH_VOLUME,
    thesis: "Deep adoption, under-realized value.",
    verdict: (s) =>
      `Officers lean on Blue Voice every day, but the AI-differentiated workflow reaches just ${fmtPct(s.premiumReachPct)} of the book — that gap is the runway.`,
  },
  {
    when: (s) => (s.volumeDeltaPct ?? 0) > 0.1 && s.risers > s.decliners,
    thesis: "Broad-based momentum.",
    verdict: (s) =>
      `Usage is up ${fmtPct(s.volumeDeltaPct ?? 0)} with ${fmt(s.risers)} accounts gaining — growth is outrunning churn.`,
  },
];

/** Neutral fallback — describe, never conclude — when no rule fires. */
const FALLBACK: Pick<ThesisRule, "thesis" | "verdict"> = {
  thesis: "The state of the book.",
  verdict: (s) => `${fmt(s.total)} active departments, median health ${s.medianHealth}/100.`,
};

export function selectThesis(s: BookSignals): { thesis: string; verdict: string } {
  const rule = THESES.find((r) => r.when(s)) ?? FALLBACK;
  return { thesis: rule.thesis, verdict: rule.verdict(s) };
}

function act1Caption(s: BookSignals, accounts: AccountIntelligence[]): string {
  if (!s.total) return "No active departments in this window.";
  const stateVals = sumByState(accounts).map((x) => x.value);
  const top5 = topShare(stateVals, 5);
  const lead = s.topState ? `${s.topState.state} alone drives ${fmtPct(s.topState.share)} of volume` : "usage is spread thin";
  return `${fmt(s.total)} departments are active, but the top 5 states hold ${fmtPct(top5)} of all questions — ${lead}. Broad, but lopsided.`;
}

function act2Caption(s: BookSignals): string {
  const dir = (s.volumeDeltaPct ?? 0) >= 0 ? "up" : "down";
  const vol = s.volumeDeltaPct == null ? "" : ` Volume is ${dir} ${fmtPct(Math.abs(s.volumeDeltaPct))}.`;
  return `${fmt(s.risers)} accounts are gaining and ${fmt(s.decliners)} are sliding ${periodWords(s.window).mom}.${vol}`;
}

function act3Caption(s: BookSignals, trends?: TrendSeries[]): string {
  const base = `Officers ask constantly but ship little — the AI-differentiated features reach just ${fmtPct(s.premiumReachPct)} of the book.`;
  const hi = trendHighlight(trends);
  return hi ? `${base} ${hi}` : base;
}

/** Names the fastest-growing premium series, e.g. "Workspace is up ~20× in 6 months." */
function trendHighlight(trends?: TrendSeries[]): string | null {
  if (!trends || trends.length === 0) return null;
  let best: { event: string; ratio: number } | null = null;
  for (const t of trends) {
    const first = t.points.find((p) => p.value > 0)?.value;
    const last = t.points[t.points.length - 1]?.value ?? 0;
    if (!first || last <= first) continue;
    const ratio = last / first;
    if (!best || ratio > best.ratio) best = { event: t.event, ratio };
  }
  if (!best || best.ratio < 1.5) return null;
  return `${best.event} is up ~${Math.round(best.ratio)}× over six months — part of the runway is already lifting off.`;
}

export function buildNarrative(data: IntelligenceResponse, trends?: TrendSeries[]): Narrative {
  const s = deriveSignals(data);
  const { thesis, verdict } = selectThesis(s);
  const coverStats: StatLine[] = [
    { value: fmtCompact(s.questionVolume), label: `questions ${periodWords(s.window).rate}` },
    { value: fmtPct(s.premiumReachPct), label: "reach premium" },
    { value: `${s.medianHealth}`, label: "median health" },
  ];
  return {
    thesis,
    verdict,
    coverStats,
    act1: act1Caption(s, data.accounts),
    act2: act2Caption(s),
    act3: act3Caption(s, trends),
    movers: topMovers(data.accounts, 3),
  };
}
