import { describe, it, expect } from 'vitest';
import { SHAPES, shapesFor, shapeMidis, chordPcs, shapeName, LEVEL_SETS, CHANGE_PAIRS, rootString } from '../src/guitar/chords';
import { parseChord, transposeName, shapeForSymbol } from '../src/guitar/symbols';

describe('코드 모양', () => {
  it('모든 모양의 음이 코드 음이고, 필수 음(근음·3도)이 다 있음', () => {
    for (const s of SHAPES) {
      const pcs = chordPcs(s.root, s.suffix);
      const played = shapeMidis(s).filter((m): m is number => m !== null).map((m) => m % 12);
      const allowed = s.bass !== undefined ? [...pcs, s.bass] : pcs;
      for (const p of played) expect(allowed, `${s.id} 에 코드 밖 음 ${p}`).toContain(p);
      expect(played, `${s.id} 근음`).toContain(s.root);
      // 3도(또는 sus 음) 필수 — 5도는 빠져도 됨
      const third = pcs[1];
      if (!['9'].includes(s.suffix)) expect(played, `${s.id} 3도`).toContain(third);
      if (s.bass !== undefined) expect(played[0], `${s.id} 베이스`).toBe(s.bass);
    }
  });
  it('손가락 번호가 있는 줄에만 프렛, 바레는 같은 프렛', () => {
    for (const s of SHAPES) {
      s.frets.forEach((f, i) => {
        if (f === null || f === 0) expect(s.fingers[i], s.id).toBe(0);
        else expect(s.fingers[i], s.id).not.toBe(0);
      });
      if (s.barre) for (let i = s.barre.from; i <= s.barre.to; i++) if (s.fingers[i] === 1) expect(s.frets[i]).toBe(s.barre.fret);
    }
  });
  it('단계별 코드와 전환 쌍은 모두 모양이 있음', () => {
    for (const lv of [1, 2, 3] as const) {
      for (const n of LEVEL_SETS[lv]) expect(shapeForSymbol(parseChord(n)!), n).not.toBeNull();
      for (const [a, b] of CHANGE_PAIRS[lv]) { expect(shapeForSymbol(parseChord(a)!)).not.toBeNull(); expect(shapeForSymbol(parseChord(b)!)).not.toBeNull(); }
    }
  });
  it('개방 코드가 먼저, F 는 작은 F 다음 1프렛 바레', () => {
    expect(shapeName(shapesFor(0, '')[0])).toBe('C');
    const f = shapesFor(5, '');
    expect(f[0].frets).toEqual([null, null, 3, 2, 1, 1]);
    expect(f[1].frets).toEqual([1, 3, 3, 2, 1, 1]);
    expect(f[1].barre).toEqual({ fret: 1, from: 0, to: 5 });
    expect(shapesFor(11, 'm')[0].frets).toEqual([null, 2, 4, 4, 3, 2]);
  });
  it('엄지 베이스 줄', () => {
    expect(rootString(shapesFor(0, '')[0])).toBe(1); // C → 5번 줄
    expect(rootString(shapesFor(7, '')[0])).toBe(0); // G → 6번 줄
    expect(rootString(shapesFor(2, '')[0])).toBe(2); // D → 4번 줄
  });
});

describe('코드 이름', () => {
  it('읽기', () => {
    expect(parseChord('C#m7/G#')).toMatchObject({ root: 1, suffix: 'm7', bass: 8 });
    expect(parseChord('Bbmaj7')).toMatchObject({ root: 10, suffix: 'maj7', flat: true });
    expect(parseChord('Asus')).toMatchObject({ root: 9, suffix: 'sus4' });
    expect(parseChord('G13')).toMatchObject({ suffix: '7' });
    expect(parseChord('Fm9')).toMatchObject({ suffix: 'm7' });
    expect(parseChord('D/F#')).toMatchObject({ root: 2, suffix: '', bass: 6 });
    expect(parseChord('E5')).toMatchObject({ suffix: '' });
    expect(parseChord('가사')).toBeNull();
    expect(parseChord('Am7b9')).toMatchObject({ suffix: 'm7' });
  });
  it('조 옮김', () => {
    expect(transposeName('G', 2)).toBe('A');
    expect(transposeName('D/F#', 1)).toBe('Eb/G');
    expect(transposeName('Am7', -2)).toBe('Gm7');
    expect(transposeName('A', -2, false)).toBe('G');
  });
});
