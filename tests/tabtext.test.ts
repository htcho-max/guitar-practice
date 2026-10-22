import { describe, it, expect } from 'vitest';
import { parseSong, parseTab } from '../src/song/parse';
import { renderTabRows } from '../src/song/tabtext';

describe('탭 글 다시 쓰기', () => {
  it('하모닉스·인공 하모닉스·탭핑·슬랩·해머온이 다시 읽어도 같음', () => {
    const ev = [
      { beat: 0, notes: [{ string: 0, fret: 0 }, { string: 5, fret: 12, harm: true }] },
      { beat: 1, notes: [{ string: 0, fret: 0, dead: true, slap: true }, { string: 4, fret: 7, art: true }] },
      { beat: 1.5, notes: [{ string: 5, fret: 12, tap: true }] },
      { beat: 2, notes: [{ string: 3, fret: 7, tech: 'h' }] },
      { beat: 2.75, notes: [{ string: 3, fret: 5 }] },
      { beat: 3, perc: true, notes: [] },
      { beat: 4, notes: [{ string: 1, fret: 3 }] },
    ];
    const rows = renderTabRows(ev, 0, 8, 4);
    const t = parseTab(rows.slice(1), 4, rows[0]);
    expect(t.beats).toBe(8);
    expect(t.events.map((e) => e.beat)).toEqual([0, 1, 1.5, 2, 2.75, 3, 4]);
    const n = (i: number) => t.events[i].notes;
    expect(n(0).find((x) => x.string === 5)).toMatchObject({ fret: 12, harm: true });
    expect(n(1).find((x) => x.string === 0)).toMatchObject({ slap: true });
    expect(n(1).find((x) => x.string === 4)).toMatchObject({ fret: 7, art: true });
    expect(n(2)[0]).toMatchObject({ fret: 12, tap: true });
    expect(n(3)[0]).toMatchObject({ fret: 7, tech: 'h' });
    expect(n(5).every((x) => x.dead)).toBe(true);
  });
  it('곡 글 안 탭 위치 (src)', () => {
    const s = parseSong('{title: x}\n\nR|q  q  q  q  |\ne|-0--1--3--5--|\nB|-------------|\nG|-------------|\nD|-------------|\nA|-------------|\nE|-------------|\n끝');
    const tab = s.blocks.find((b) => b.kind === 'tab')!;
    expect(tab.kind === 'tab' && tab.src).toEqual([2, 9]);
  });
});
