import { describe, it, expect } from 'vitest';
import { magnitudes } from '../src/audio/fft';
import { OnsetDetector, tonality, type Onset } from '../src/audio/onset';
import { render, SR } from './audio-helpers';

const FFT = 2048, HOP = 800;
function onsets(sig: Float32Array): Onset[] {
  const d = new OnsetDetector();
  const out: Onset[] = [];
  for (let end = FFT; end <= sig.length; end += HOP) {
    const o = d.push(magnitudes(sig.subarray(end - FFT, end)), end / SR - (FFT / SR) * 0.35, SR, FFT);
    if (o) out.push(o);
    if (end + HOP > sig.length) { const f = d.flush(magnitudes(sig.subarray(end - FFT, end)), SR, FFT); if (f) out.push(f); }
  }
  return out;
}
/** 몸통 치기 비슷한 소리: 낮은 '쿵' (감쇠하는 잡음) */
function thump(sig: Float32Array, at: number) {
  let x = 7, lp = 0;
  const o = Math.floor(at * SR);
  for (let i = 0; i < SR * 0.12 && o + i < sig.length; i++) {
    x = (x * 16807) % 2147483647;
    const n = (x / 2147483647) * 2 - 1;
    lp += 0.08 * (n - lp);
    sig[o + i] += lp * 6 * Math.exp(-i / (SR * 0.025));
  }
}

describe('퍼커시브 / 음 구별', () => {
  it('베이스 음 – 몸통 – 베이스 음 – 몸통: 소리 시작 넷, 음 뚜렷함으로 구별', () => {
    const sig = render([{ midi: 40, at: 0.2, vel: 0.7 }, { midi: 45, at: 1.0, vel: 0.7 }], 1.8);
    thump(sig, 0.6); thump(sig, 1.4);
    const got = onsets(sig);
    expect(got.length).toBe(4);
    const t = got.map((o) => tonality(o.chroma));
    expect(t[0]).toBeGreaterThan(t[1]);
    expect(t[2]).toBeGreaterThan(t[3]);
  });
});
