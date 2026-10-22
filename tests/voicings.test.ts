import { describe, it, expect } from 'vitest';
import { findVoicings } from '../src/guitar/voicings';
import { chordPcs } from '../src/guitar/chords';
import { TUNINGS, tuningById } from '../src/guitar/tunings';
import { shapeForSymbol, parseChord } from '../src/guitar/symbols';

describe('변칙 조율 코드 자리', () => {
  const names = ['C', 'G', 'D', 'Em', 'Am', 'A', 'E', 'F', 'Bm', 'Dsus4', 'G7', 'Cmaj7', 'Asus2', 'Bb'];
  for (const t of TUNINGS) {
    it(`${t.name}: 흔한 코드 모두 자리가 있고, 음이 맞음`, () => {
      for (const n of names) {
        const c = parseChord(n)!;
        const v = shapeForSymbol(c, 0, t.midi);
        expect(v, `${t.id} ${n}`).not.toBeNull();
        const pcs = chordPcs(c.root, c.suffix);
        const played = v!.frets.map((f, i) => (f === null ? null : (t.midi[i] + f) % 12)).filter((x): x is number => x !== null);
        expect(played[0], `${t.id} ${n} 베이스`).toBe(c.root);
        for (const p of played) expect(pcs, `${t.id} ${n}`).toContain(p);
        expect(played.length).toBeGreaterThanOrEqual(4);
        const fretted = v!.frets.filter((f): f is number => f !== null && f > 0);
        if (fretted.length) expect(Math.max(...fretted) - Math.min(...fretted)).toBeLessThanOrEqual(3);
      }
    });
  }
  it('DADGAD 의 D 는 개방 줄을 많이 씀', () => {
    const v = findVoicings(2, '', tuningById('dadgad').midi);
    expect(v[0].frets.filter((f) => f === 0).length).toBeGreaterThanOrEqual(3);
  });
});
