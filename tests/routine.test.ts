import { describe, it, expect } from 'vitest';
import { buildRoutine, type RoutineCand } from '../src/data/routine';

const c = (key: string, weight: number, order: number, fixedMin?: number): RoutineCand => ({ key, title: key, nav: { tab: 'today' }, weight, order, fixedMin });
const cands = [c('tuner', 0, 0, 1), c('review', 2, 2), c('change', 2, 3), c('fs', 3, 4), c('tech', 2, 1), c('song', 3, 6), c('fret', 1, 5)];

describe('연습 루틴', () => {
  it('분을 정확히 나누고 순서대로', () => {
    for (const m of [10, 20, 30, 45, 60]) {
      const r = buildRoutine(m, cands);
      expect(r.reduce((t, s) => t + s.min, 0)).toBe(m);
      expect(r[0].key).toBe('tuner');
      expect(r.every((s) => s.min >= 1)).toBe(true);
    }
  });
  it('짧으면 중요한 것만', () => {
    const r = buildRoutine(10, cands).map((s) => s.key);
    expect(r).toContain('fs');
    expect(r).toContain('song');
    expect(r).not.toContain('fret');
    expect(buildRoutine(45, cands).length).toBeGreaterThan(r.length);
  });
});
