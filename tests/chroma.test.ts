import { describe, it, expect } from 'vitest';
import { magnitudes } from '../src/audio/fft';
import { chromaFromMags, judgeChord } from '../src/audio/chroma';
import { shapesFor, shapeMidis, chordPcs, LEVEL_SETS } from '../src/guitar/chords';
import { parseChord, shapeForSymbol } from '../src/guitar/symbols';
import { render, strum, SR } from './audio-helpers';

const N = 16384;
function chromaOf(sig: Float32Array, at = 0.25) {
  const o = Math.floor(at * SR);
  return chromaFromMags(magnitudes(sig.subarray(o, o + N)), SR, N);
}

describe('코드 판정 (크로마)', () => {
  it('단계별 코드를 모두 맞음으로', () => {
    const fails: string[] = [];
    for (const name of [...LEVEL_SETS[1], ...LEVEL_SETS[2], ...LEVEL_SETS[3]]) {
      const c = parseChord(name)!;
      const shape = shapeForSymbol(c)!;
      const v = judgeChord(chromaOf(render(strum(shapeMidis(shape)), 1.0, 0.002)), chordPcs(c.root, c.suffix), c.bass);
      if (v.verdict !== 'ok') fails.push(`${name}: ${v.verdict} ${v.score.toFixed(2)} 들림 ${v.heard} ${v.heardScore.toFixed(2)} 빠짐 ${v.missing}`);
    }
    expect(fails).toEqual([]);
  });
  it('다른 코드를 잡으면 맞음이 아님', () => {
    const pairs: [string, string][] = [['C', 'Am'], ['G', 'Em'], ['D', 'Dm'], ['E', 'Em'], ['Am', 'C'], ['A', 'Am'], ['C', 'G'], ['F', 'Dm']];
    for (const [target, played] of pairs) {
      const t = parseChord(target)!, p = parseChord(played)!;
      const v = judgeChord(chromaOf(render(strum(shapeMidis(shapeForSymbol(p)!)), 1.0)), chordPcs(t.root, t.suffix));
      expect(v.verdict, `${target} 자리에 ${played}`).not.toBe('ok');
      expect(v.heard, `${played} 들림`).toBe(played);
    }
  });
  it('한 줄이 안 울리면(뮤트) 그 음이 빠짐', () => {
    // Am 에서 2번 줄(C)이 죽으면 C 가 빠짐
    const m = shapeMidis(shapesFor(9, 'm')[0]);
    m[4] = null;
    const v = judgeChord(chromaOf(render(strum(m), 1.0)), [9, 0, 4]);
    expect(v.verdict).not.toBe('ok');
    expect(v.missing).toContain(0);
  });
});
