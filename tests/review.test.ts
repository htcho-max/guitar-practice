import { describe, it, expect } from 'vitest';
import { nextReview } from '../src/data/review';

const inp = { key: 'change:C|G', kind: 'change' as const, label: 'C ↔ G', nav: {}, note: '25번' };
describe('복습함', () => {
  it('통과면 넣지 않고, 실패면 상자 1 · 내일', () => {
    expect(nextReview(undefined, inp, true, '2026-10-22')).toBeNull();
    expect(nextReview(undefined, inp, false, '2026-10-22')).toMatchObject({ box: 1, due: '2026-10-23', added: '2026-10-22' });
  });
  it('통과할수록 간격이 늘고, 상자 5 에서 통과하면 졸업', () => {
    let r = nextReview(undefined, inp, false, '2026-10-22')!;
    r = nextReview(r, inp, true, '2026-10-23')!;
    expect(r).toMatchObject({ box: 2, due: '2026-10-25' });
    r = nextReview(r, inp, true, '2026-10-25')!;
    expect(r).toMatchObject({ box: 3, due: '2026-10-29' });
    r = { ...r, box: 5 };
    expect(nextReview(r, inp, true, '2026-11-20')).toBeNull();
  });
  it('실패하면 상자 1 로', () => {
    const r = nextReview({ ...inp, box: 4, due: '2026-10-30', added: 'x', last: 'x' }, inp, false, '2026-10-30')!;
    expect(r).toMatchObject({ box: 1, due: '2026-10-31' });
  });
  it('같은 날 두 번 통과해도 한 칸만', () => {
    let r = nextReview(undefined, inp, false, '2026-10-22')!;
    r = nextReview(r, inp, true, '2026-10-23')!;
    const again = nextReview(r, inp, true, '2026-10-23')!;
    expect(again.box).toBe(2);
  });
});

import { candidates, pickPosition, updateStat, fretsOf, weightOf } from '../src/fret/quiz';
import { STANDARD } from '../src/guitar/tunings';
describe('지판 퀴즈', () => {
  const o = { strings: [0, 1, 2, 3, 4, 5], maxFret: 12, naturalsOnly: true, tuning: STANDARD.midi };
  it('자연음만: 줄마다 8자리 (0·12 같은 음 포함)', () => {
    expect(candidates(o).filter((p) => p.s === 0).map((p) => p.f)).toEqual([0, 1, 3, 5, 7, 8, 10, 12]);
  });
  it('약한 자리가 더 자주', () => {
    let st = {};
    for (let i = 0; i < 5; i++) st = updateStat(st, '0:3', false, 0);
    expect(weightOf((st as Record<string, never>)['0:3'])).toBeGreaterThan(weightOf(undefined));
    let n = 0;
    let seed = 1;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < 2000; i++) { const p = pickPosition({ ...o, strings: [0] }, st, rnd); if (p.f === 3) n++; }
    expect(n / 2000).toBeGreaterThan(1 / 8 * 1.5);
  });
  it('줄 위 같은 음 자리', () => {
    expect(fretsOf(4, 0, STANDARD.midi, 12)).toEqual([0, 12]);
    expect(fretsOf(0, 1, STANDARD.midi, 12)).toEqual([3]);
  });
});

import { weekStart, weeklyMinutes, changeProgress } from '../src/data/trends';
describe('주별 추이', () => {
  it('월요일 시작', () => {
    expect(weekStart('2026-10-22')).toBe('2026-10-19'); // 목 → 월
    expect(weekStart('2026-10-25')).toBe('2026-10-19'); // 일 → 그 주 월
  });
  it('주별 분, 쌍별 처음 → 최고', () => {
    const w = weeklyMinutes([{ key: 'a', date: '2026-10-20', kind: 'chord', sec: 600 }, { key: 'b', date: '2026-10-13', kind: 'song', sec: 300 }], '2026-10-22', 3);
    expect(w).toEqual([{ week: '2026-10-05', min: 0 }, { week: '2026-10-12', min: 5 }, { week: '2026-10-19', min: 10 }]);
    const p = changeProgress([{ pair: 'C|G', count: 20, date: 'x', at: 1, auto: true }, { pair: 'C|G', count: 31, date: 'x', at: 2, auto: true }, { pair: 'C|G', count: 28, date: 'x', at: 3, auto: true }]);
    expect(p[0]).toMatchObject({ label: 'C ↔ G', first: 20, best: 31, last: 28, n: 3 });
  });
});
