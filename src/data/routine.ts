import type { NavRequest } from '../state/navigate';

export interface RoutineCand { key: string; title: string; nav: NavRequest; /** 중요도 (클수록 먼저·오래) */ weight: number; /** 순서 (작을수록 앞) */ order: number; tip?: string; fixedMin?: number }
export interface RoutineStep { key: string; title: string; nav: NavRequest; min: number; tip?: string }

/** 주어진 분에 맞춰 할 일을 고르고 시간을 나눔 */
export function buildRoutine(minutes: number, cands: RoutineCand[]): RoutineStep[] {
  if (!cands.length || minutes <= 0) return [];
  const fixed = cands.filter((c) => c.fixedMin);
  const rest = cands.filter((c) => !c.fixedMin).map((c, i) => ({ c, i })).sort((a, b) => b.c.weight - a.c.weight || a.i - b.i).map((x) => x.c);
  const fixedMin = fixed.reduce((t, c) => t + c.fixedMin!, 0);
  const left = Math.max(2, minutes - fixedMin);
  const k = Math.max(1, Math.min(rest.length, Math.round(left / (minutes <= 15 ? 3.5 : 5))));
  const pick = rest.slice(0, k);
  const wsum = pick.reduce((t, c) => t + c.weight, 0) || 1;
  const mins = pick.map((c) => Math.max(2, Math.round((left * c.weight) / wsum)));
  // 합을 맞춤 (가장 긴 것에서 빼거나 더함)
  let diff = left - mins.reduce((a, b) => a + b, 0);
  for (let guard = 0; diff !== 0 && guard < 100; guard++) {
    const i = diff > 0 ? mins.indexOf(Math.min(...mins)) : mins.indexOf(Math.max(...mins));
    if (diff < 0 && mins[i] <= 2) break;
    mins[i] += diff > 0 ? 1 : -1;
    diff += diff > 0 ? -1 : 1;
  }
  const steps = [
    ...fixed.map((c) => ({ c, min: c.fixedMin! })),
    ...pick.map((c, i) => ({ c, min: mins[i] })),
  ].sort((a, b) => a.c.order - b.c.order);
  return steps.map(({ c, min }) => ({ key: c.key, title: c.title, nav: c.nav, min, tip: c.tip }));
}
