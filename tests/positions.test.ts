import { describe, it, expect } from 'vitest';
import { barPositions, findShifts } from '../src/song/positions';
import { updateBarStats, weakBars } from '../src/data/weakbars';

describe('포지션 지도', () => {
  const ev = [
    { beat: 0, notes: [{ string: 5, fret: 0 }, { string: 0, fret: 3 }] },
    { beat: 1, notes: [{ string: 4, fret: 1 }] },
    { beat: 4, notes: [{ string: 5, fret: 7 }, { string: 4, fret: 8 }] },
    { beat: 5, notes: [{ string: 5, fret: 10 }] },
    { beat: 6, notes: [{ string: 5, fret: 12, harm: true }] },
    { beat: 8, notes: [{ string: 5, fret: 2 }] },
  ];
  it('마디마다 검지 자리', () => {
    const bp = barPositions(ev, 4, 3);
    expect(bp.map((b) => b.pos)).toEqual([1, 7, 2]);
    expect(bp[1].hi).toBe(10);
  });
  it('크게 옮기는 곳', () => {
    const sh = findShifts(ev, 4);
    expect(sh.map((s) => [s.bar, s.from, s.to])).toEqual([[1, 1, 7], [2, 7, 2]]);
  });
});

describe('약한 마디', () => {
  it('놓친 비율로 고르고 최근을 무겁게', () => {
    let s = updateBarStats({}, [{ bar: 0, ok: true }, { bar: 0, ok: true }, { bar: 3, ok: false }, { bar: 3, ok: true }, { bar: 5, ok: false }]);
    expect(weakBars(s).map((x) => x.bar)).toEqual([3]); // 5마디는 한 번뿐
    s = updateBarStats(s, [{ bar: 5, ok: false }, { bar: 3, ok: true }, { bar: 3, ok: true }]);
    const w = weakBars(s);
    expect(w[0].bar).toBe(5);
    expect(w.some((x) => x.bar === 0)).toBe(false);
  });
});
