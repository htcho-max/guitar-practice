/** 지판 음 이름 퀴즈: 약한 자리를 더 자주 */
export interface PosStat { n: number; ok: number; ms: number }
export type FretStats = Record<string, PosStat>;
export const NATURAL_PCS = [0, 2, 4, 5, 7, 9, 11];

export interface QuizOpts { strings: number[]; maxFret: number; naturalsOnly: boolean; tuning: number[] }

export function candidates(o: QuizOpts): { s: number; f: number }[] {
  const out: { s: number; f: number }[] = [];
  for (const s of o.strings) for (let f = 0; f <= o.maxFret; f++) {
    if (o.naturalsOnly && !NATURAL_PCS.includes((o.tuning[s] + f) % 12)) continue;
    out.push({ s, f });
  }
  return out;
}

/** 자리 무게: 틀린 비율·느림·처음 보는 자리일수록 큼 */
export function weightOf(st: PosStat | undefined): number {
  if (!st || st.n === 0) return 2;
  const acc = st.ok / st.n;
  return 1 + 4 * (1 - acc) + (st.ms > 3000 ? 1 : 0) + (st.n < 3 ? 0.5 : 0);
}

export function pickPosition(o: QuizOpts, stats: FretStats, rand = Math.random, avoid?: string): { s: number; f: number } {
  const c = candidates(o).filter((p) => `${p.s}:${p.f}` !== avoid);
  const ws = c.map((p) => weightOf(stats[`${p.s}:${p.f}`]));
  let r = rand() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < c.length; i++) { r -= ws[i]; if (r <= 0) return c[i]; }
  return c[c.length - 1];
}

export function updateStat(stats: FretStats, key: string, ok: boolean, ms: number): FretStats {
  const p = stats[key] ?? { n: 0, ok: 0, ms: 0 };
  const okN = p.ok + (ok ? 1 : 0);
  return { ...stats, [key]: { n: p.n + 1, ok: okN, ms: ok ? (p.ms * p.ok + ms) / okN : p.ms } };
}

/** 같은 줄에서 이 음이 나는 프렛 (0~maxFret) */
export function fretsOf(pc: number, s: number, tuning: number[], maxFret: number): number[] {
  const out: number[] = [];
  for (let f = 0; f <= maxFret; f++) if ((tuning[s] + f) % 12 === pc) out.push(f);
  return out;
}
