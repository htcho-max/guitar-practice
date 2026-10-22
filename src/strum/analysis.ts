import type { RunResult } from '../finger/score';

export interface StrumHeard { lowShare: number; strength: number }

/** 다운·업 비교: 업이 굵은 줄까지 치는지, 세기 차이 */
export function strumBalance(r: RunResult, kinds: ('D' | 'U' | 'x')[], heard: Map<number, StrumHeard>): { hint: string | null; downLow: number; upLow: number } {
  const lows: Record<'D' | 'U', number[]> = { D: [], U: [] };
  const strong: Record<'D' | 'U', number[]> = { D: [], U: [] };
  r.steps.forEach((s, i) => {
    const k = kinds[i];
    if (!s.heard || (k !== 'D' && k !== 'U')) return;
    const h = heard.get(s.heard.time);
    if (!h) return;
    lows[k].push(h.lowShare);
    strong[k].push(h.strength);
  });
  const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN);
  const downLow = avg(lows.D), upLow = avg(lows.U);
  let hint: string | null = null;
  if (lows.D.length >= 2 && lows.U.length >= 2) {
    if (upLow > downLow * 0.85) hint = '업 스트로크가 굵은 줄까지 치는 것 같아요. 업은 위 3~4줄만 가볍게 스쳐요.';
    else if (avg(strong.U) > avg(strong.D) * 1.15) hint = '업이 다운보다 세요. 다운에 무게를 두면 리듬이 살아요.';
  }
  return { hint, downLow, upLow };
}
