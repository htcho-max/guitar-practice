import { describe, it, expect } from 'vitest';
import { magnitudes } from '../src/audio/fft';
import { OnsetDetector, matchesNotes } from '../src/audio/onset';
import { render, SR } from './audio-helpers';

const FFT = 2048, HOP = 800;
function detect(sig: Float32Array) {
  const d = new OnsetDetector();
  const found: { time: number; pc: number | null; chroma: number[] }[] = [];
  for (let end = FFT; end <= sig.length; end += HOP) {
    const t = end / SR - (FFT / SR) * 0.35;
    const o = d.push(magnitudes(sig.subarray(end - FFT, end)), t, SR, FFT);
    if (o) found.push({ time: o.time, pc: o.pc, chroma: o.chroma });
    if (end + HOP > sig.length) { const f = d.flush(magnitudes(sig.subarray(end - FFT, end)), SR, FFT); if (f) found.push({ time: f.time, pc: f.pc, chroma: f.chroma }); }
  }
  return found;
}

describe('소리 시작 찾기', () => {
  it('아르페지오 (C 코드 p-i-m-a) 시각과 음', () => {
    // 5번 줄 C3, 3번 줄 G3, 2번 줄 C4, 1번 줄 E4 … 겹쳐 울림
    const seq = [48, 55, 60, 64, 60, 55, 52, 55, 48, 55, 60, 64];
    const notes = seq.map((midi, i) => ({ midi, at: 0.2 + i * 0.25 }));
    const got = detect(render(notes, 3.6, 0.001));
    expect(got.length).toBe(seq.length);
    got.forEach((g, i) => {
      expect(Math.abs(g.time - notes[i].at), `${i}번째 시각`).toBeLessThan(0.035);
    });
    const pcOk = got.filter((g, i) => matchesNotes(g.chroma, [seq[i] % 12])).length;
    expect(pcOk).toBe(seq.length);
    // 틀린 음은 아니라고
    const wrong = got.filter((g, i) => matchesNotes(g.chroma, [(seq[i] + 1) % 12])).length;
    expect(wrong).toBeLessThanOrEqual(1);
  });
  it('조용하면 아무것도 안 셈', () => {
    expect(detect(render([], 1.0, 0.003))).toEqual([]);
  });
  it('빠른 16분음표 (120BPM = 0.125초)', () => {
    const seq = [40, 59, 55, 59, 47, 59, 55, 59];
    const notes = seq.map((midi, i) => ({ midi, at: 0.1 + i * 0.125 }));
    const got = detect(render(notes, 1.4));
    expect(got.length).toBe(seq.length);
  });
});
