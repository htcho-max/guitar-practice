import { describe, it, expect } from 'vitest';
import { parseSong } from '../src/song/parse';
import { buildTimeline } from '../src/song/timeline';
import { buildPlan, slicePlan, blockRange } from '../src/song/plan';
import { parseChord, shapeForSymbol, transposeName } from '../src/guitar/symbols';
import { STANDARD } from '../src/guitar/tunings';

const shapeOf = (n: string) => { const c = parseChord(n); return c ? shapeForSymbol(c) : null; };
const base = { beatsPerBar: 4, tuning: STANDARD.midi, capo: 0, tabShift: 0, strum: 'D-DU-UDU', fingerId: 'pima', shown: (n: string) => n, shapeOf };

describe('곡 재생 계획', () => {
  const song = parseSong('| G | C . D . |\ne|---3---|\nB|-------|\nG|-0-----|\nD|-------|\nA|-------|\nE|-------|');
  const tl = buildTimeline(song);
  it('긁기: 마디마다 6번, 코드 바뀌는 칸은 다운', () => {
    const p = buildPlan(tl, { ...base, accomp: 'strum' });
    const strums = p.filter((e) => e.sound?.kind === 'strum');
    // G 한 마디 6번 + C 2박(D, D, U) + D 2박(다운으로 시작 U→D, D, U)
    expect(strums.filter((e) => e.beat < 4)).toHaveLength(6);
    const d = strums.find((e) => e.beat === 6)!;
    expect(d.sound).toMatchObject({ dir: 'down' });
    expect(p.every((e) => !e.expect || e.expect.hit || e.expect.pcs.length)).toBe(true);
  });
  it('코드 확인 정보: 카포 2 이면 소리 나는 코드 음', () => {
    const p = buildPlan(tl, { ...base, accomp: 'none', capo: 2, shown: (n) => transposeName(n, -2) });
    const g = p.find((e) => e.check)!;
    expect(g.check!.name).toBe('F');
    expect(g.check!.pcs.sort()).toEqual([7, 11, 2].sort()); // F 모양 + 카포 2 = G
  });
  it('탭은 음, 구간 자르기', () => {
    const p = buildPlan(tl, { ...base, accomp: 'none' });
    const tab = p.filter((e) => e.vis?.event !== undefined);
    expect(tab.map((e) => e.beat)).toEqual([8, 9]);
    expect(tab[0].expect!.pcs).toEqual([7]); // G 줄 개방
    const [from, to] = blockRange(tl, 1, 1);
    expect([from, to]).toEqual([8, 12]);
    expect(slicePlan(p, from, to).map((e) => e.beat)).toEqual([0, 1]);
  });
});
