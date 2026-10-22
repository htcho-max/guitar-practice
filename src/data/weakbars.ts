import { kvGet, kvSet } from './db';

/** 마디별 놓친 비율 (최근 것일수록 무겁게) */
export type BarStats = Record<number, { n: number; miss: number }>;
const DECAY = 0.6;

export function updateBarStats(stats: BarStats, hits: { bar: number; ok: boolean }[]): BarStats {
  const out: BarStats = { ...stats };
  const by = new Map<number, { n: number; miss: number }>();
  for (const h of hits) { const c = by.get(h.bar) ?? { n: 0, miss: 0 }; c.n++; if (!h.ok) c.miss++; by.set(h.bar, c); }
  for (const [bar, c] of by) {
    const p = out[bar] ?? { n: 0, miss: 0 };
    out[bar] = { n: p.n * DECAY + c.n, miss: p.miss * DECAY + c.miss };
  }
  return out;
}

/** 약한 마디 (놓친 비율 높은 순, 0부터 센 마디 번호) */
export function weakBars(stats: BarStats, max = 5, minRate = 0.3): { bar: number; rate: number }[] {
  return Object.entries(stats)
    .map(([b, s]) => ({ bar: Number(b), rate: s.n ? s.miss / s.n : 0, n: s.n }))
    .filter((x) => x.n >= 1.5 && x.rate >= minRate)
    .sort((a, b) => b.rate - a.rate || a.bar - b.bar)
    .slice(0, max)
    .map(({ bar, rate }) => ({ bar, rate }));
}

export const weakKey = (songId: string) => `weak-bars:${songId}`;
export async function loadBarStats(songId: string): Promise<BarStats> { return kvGet<BarStats>(weakKey(songId), {}); }
export async function addBarHits(songId: string, hits: { bar: number; ok: boolean }[]): Promise<BarStats> {
  const s = updateBarStats(await loadBarStats(songId), hits);
  await kvSet(weakKey(songId), s);
  return s;
}
/** 집중 연습을 통과하면 그 마디 기록을 가볍게 */
export async function easeBars(songId: string, bars: number[]): Promise<BarStats> {
  const s = { ...(await loadBarStats(songId)) };
  for (const b of bars) if (s[b]) s[b] = { n: s[b].n, miss: s[b].miss * 0.4 };
  await kvSet(weakKey(songId), s);
  return s;
}
