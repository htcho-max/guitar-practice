import { describe, it, expect } from 'vitest';
import { SCALES, boxNotes, neckNotes, scaleById, positionCount } from '../src/guitar/scales';

const frets = (ns: { string: number; fret: number }[]) => [0, 1, 2, 3, 4, 5].map((s) => ns.filter((n) => n.string === s).map((n) => n.fret));

describe('스케일 모양', () => {
  it('A 마이너 펜타토닉 1번 박스 = 5~8프렛', () => {
    expect(frets(boxNotes(scaleById('minpent'), 9, 0))).toEqual([[5, 8], [5, 7], [5, 7], [5, 7], [5, 8], [5, 8]]);
  });
  it('A 마이너 펜타토닉 2번 박스 = 7~10', () => {
    expect(frets(boxNotes(scaleById('minpent'), 9, 1))).toEqual([[8, 10], [7, 10], [7, 10], [7, 9], [8, 10], [8, 10]]);
  });
  it('G 메이저 3음씩 1번 = 3 5 7 / 3 5 7 / 4 5 7 / 4 5 7 / 5 7 8 / 5 7 8', () => {
    expect(frets(boxNotes(scaleById('major'), 7, 0))).toEqual([[3, 5, 7], [3, 5, 7], [4, 5, 7], [4, 5, 7], [5, 7, 8], [5, 7, 8]]);
  });
  it('모든 스케일·근음·포지션: 음은 스케일 안, 오름차순, 프렛 0~17, 한 손 폭(5칸) 안', () => {
    for (const sc of SCALES) for (let r = 0; r < 12; r++) for (let p = 0; p < positionCount(sc); p++) {
      const b = boxNotes(sc, r, p);
      const ms = b.map((n) => n.midi);
      expect(ms.slice().sort((a, c) => a - c), `${sc.id} ${r} ${p}`).toEqual(ms);
      for (const n of b) {
        expect(sc.iv).toContain((((n.midi - r) % 12) + 12) % 12);
        expect(n.fret).toBeGreaterThanOrEqual(0);
        expect(n.fret).toBeLessThanOrEqual(17);
      }
      const fr = b.map((n) => n.fret);
      expect(Math.max(...fr) - Math.min(...fr), `${sc.id} r${r} p${p} 폭`).toBeLessThanOrEqual(sc.perString === 3 ? 6 : 4);
    }
  });
  it('지판 전체 음', () => {
    const all = neckNotes(scaleById('minpent'), 9, undefined, 12);
    expect(all.filter((n) => n.degree === 'R').map((n) => `${n.string}:${n.fret}`)).toContain('0:5');
  });
});
