import { describe, it, expect } from 'vitest';
import { PATTERNS, PROGRESSIONS, realize, patternById, slots } from '../src/finger/patterns';
import { matchRun, passed } from '../src/finger/score';
import { shapesFor } from '../src/guitar/chords';
import { parseChord, shapeForSymbol } from '../src/guitar/symbols';

const C = shapesFor(0, '')[0], G = shapesFor(7, '')[0], D = shapesFor(2, '')[0];

describe('핑거 패턴', () => {
  it('모든 패턴의 칸 수 = 박 × 나눔', () => {
    for (const p of PATTERNS) expect(slots(p).length, p.id).toBe(p.beats * p.sub);
  });
  it('트래비스: C 는 5·4번 줄 교대, G 는 6·4번 줄', () => {
    const t = patternById('travis');
    const c = realize(t, C);
    expect(c[0].notes[0]).toMatchObject({ string: 1, fret: 3 }); // 5번 줄 3프렛 C
    expect(c[2].notes[0]).toMatchObject({ string: 2, fret: 2 }); // 4번 줄 2프렛 E
    expect(c[1].notes[0]).toMatchObject({ string: 4, fret: 1 }); // m = 2번 줄
    const g = realize(t, G);
    expect(g[0].notes[0]).toMatchObject({ string: 0, fret: 3 });
    expect(g[2].notes[0]).toMatchObject({ string: 2, fret: 0 });
  });
  it('D 코드 교대 베이스는 5번 줄 개방(A, 코드 음)', () => {
    const d = realize(patternById('thumb'), D);
    expect(d[0].notes[0]).toMatchObject({ string: 2, fret: 0 });
    expect(d[1].notes[0]).toMatchObject({ string: 1, fret: 0 });
  });
  it('핀치는 두 음, 히트는 음 없음', () => {
    expect(realize(patternById('pinch'), C)[0].notes).toHaveLength(2);
    const perc = realize(patternById('perc'), C);
    expect(perc[2].hit).toBe(true);
    expect(perc[2].notes).toHaveLength(0);
  });
  it('카포: 프렛은 그대로, 소리는 올라감', () => {
    const a = realize(patternById('pima'), C, undefined, 2);
    expect(a[0].notes[0]).toMatchObject({ fret: 3, midi: 48 + 2 });
  });
  it('연습 진행의 코드는 모두 모양이 있음', () => {
    for (const p of PROGRESSIONS) for (const c of p.chords) expect(shapeForSymbol(parseChord(c)!), c).not.toBeNull();
  });
});

describe('따라 치기 채점', () => {
  const tpl = (p: number) => { const t = new Array(12).fill(0); t[p] = 1; t[(p + 7) % 12] = 0.5; return t; };
  const exp = [0, 0.25, 0.5, 0.75].map((time, i) => ({ time, pcs: [[0], [7], [0], [4]][i], hit: false, slot: i, lap: 0 }));
  it('다 맞으면 통과', () => {
    const heard = exp.map((e, i) => ({ time: e.time + (i % 2 ? 0.01 : -0.01), chroma: tpl(e.pcs[0]) }));
    const r = matchRun(exp, heard, 0.25);
    expect(r.hitRate).toBe(1);
    expect(r.pitchRate).toBe(1);
    expect(Math.abs(r.meanMs)).toBeLessThan(1);
    expect(passed(r)).toBe(true);
  });
  it('하나 놓치고 하나 틀린 음, 하나 더 침', () => {
    const heard = [{ time: 0.02, chroma: tpl(0) }, { time: 0.27, chroma: tpl(1) }, { time: 0.62, chroma: tpl(0) }, { time: 1.2, chroma: tpl(4) }];
    const r = matchRun(exp, heard, 0.25);
    expect(r.steps.map((s) => !!s.heard)).toEqual([true, true, false, false]);
    expect(r.steps[1].pitchOk).toBe(false);
    expect(r.extra).toHaveLength(2);
    expect(passed(r)).toBe(false);
    expect(r.weakSlots[0].slot).toBe(1);
  });
});
