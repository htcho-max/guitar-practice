import { describe, it, expect } from 'vitest';
import { PitchDetector } from 'pitchy';
import { ksSamples } from '../src/audio/pluck';

describe('기타 줄 소리 (카플러스-스트롱)', () => {
  it('음정이 ±1센트 안 (6번 줄 E2 ~ 1번 줄 12프렛 E5)', () => {
    const det = PitchDetector.forFloat32Array(8192);
    for (const f of [82.41, 110, 146.83, 196, 246.94, 329.63, 440, 659.26]) {
      const s = ksSamples(f, 48000, { seconds: 1 });
      const [p] = det.findPitch(s.subarray(12000, 12000 + 8192), 48000);
      expect(Math.abs(1200 * Math.log2(p / f)), `${f}Hz`).toBeLessThan(1);
    }
  });
  it('감은 줄·하모닉스도 음정 ±2센트', () => {
    const det = PitchDetector.forFloat32Array(8192);
    for (const [f, o] of [[82.41, { wound: true }], [146.83, { wound: true }], [329.63, { harmonic: true }], [987.77, { harmonic: true }], [1318.5, { harmonic: true }]] as const) {
      const s = ksSamples(f, 48000, { seconds: 1, ...o });
      const [p] = det.findPitch(s.subarray(12000, 12000 + 8192), 48000);
      expect(Math.abs(1200 * Math.log2(p / f)), `${f}Hz`).toBeLessThan(2);
    }
  });
  it('최대 크기 1, 끝은 조용', () => {
    const s = ksSamples(110, 48000, { seconds: 2 });
    expect(Math.max(...s.map(Math.abs))).toBeCloseTo(1, 5);
    expect(Math.abs(s[s.length - 1])).toBeLessThan(1e-3);
  });
});
