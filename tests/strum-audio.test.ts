import { describe, it, expect } from 'vitest';
import { magnitudes } from '../src/audio/fft';
import { OnsetDetector, type Onset } from '../src/audio/onset';
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

describe('스트럼 소리', () => {
  it('다운(여섯 줄)은 업(위 네 줄)보다 낮은 소리 비율이 큼, 8분 긋기 모두 셈', () => {
    const G = [43, 47, 50, 55, 59, 67];
    const notes: { midi: number; at: number; vel?: number }[] = [];
    const kinds: string[] = [];
    for (let i = 0; i < 8; i++) {
      const at = 0.2 + i * 0.3;
      const down = i % 2 === 0;
      kinds.push(down ? 'D' : 'U');
      const ms = down ? G : G.slice(2).reverse();
      ms.forEach((midi, k) => notes.push({ midi, at: at + k * 0.012, vel: down ? 0.5 : 0.35 }));
    }
    const got = onsets(render(notes, 3));
    expect(got.length).toBe(8);
    const d = got.filter((_, i) => kinds[i] === 'D').map((o) => o.lowShare);
    const u = got.filter((_, i) => kinds[i] === 'U').map((o) => o.lowShare);
    const avg = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(avg(d)).toBeGreaterThan(avg(u) * 1.3);
  });
});
