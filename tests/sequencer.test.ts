import { describe, it, expect } from 'vitest';
import { Sequencer } from '../src/audio/sequencer';

describe('재생기', () => {
  it('박 → 시각 (셈 포함, 반복)', async () => {
    const s = new Sequencer();
    // start 없이 내부 값만 확인
    (s as unknown as { o: unknown; startTime: number }).o = { bpm: 120, loopBeats: 8, meterBeats: 4, countIn: 4 };
    (s as unknown as { startTime: number }).startTime = 10;
    expect(s.timeOf(0)).toBeCloseTo(12);
    expect(s.timeOf(1, 1)).toBeCloseTo(10 + (4 + 8 + 1) * 0.5);
    expect(s.t0).toBeCloseTo(12);
  });
});
