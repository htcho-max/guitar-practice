/**
 * 실제 스틸 기타 녹음 (FluidR3_GM acoustic_guitar_steel, Frank Wen, CC BY 3.0 — public/samples/steel/LICENSE.txt).
 * MIDI 38(D2) ~ 86(D6) 한 음씩. 처음 쓸 때 내려받고, 서비스 워커가 저장해 두면 오프라인에서도.
 */
export const SAMPLE_LO = 38, SAMPLE_HI = 86;

class SampleBank {
  private bufs = new Map<number, { buffer: AudioBuffer; offset: number }>();
  private loading: Promise<void> | null = null;
  private ctx: BaseAudioContext | null = null;
  progress = 0;
  failed = false;
  private listeners = new Set<() => void>();
  onChange(fn: () => void) { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; }
  get ready() { return this.bufs.size >= SAMPLE_HI - SAMPLE_LO + 1; }

  load(ctx: BaseAudioContext): Promise<void> {
    if (this.loading && this.ctx === ctx) return this.loading;
    this.ctx = ctx;
    this.failed = false;
    const base = (import.meta.env?.BASE_URL ?? '/') + 'samples/steel/';
    const todo = Array.from({ length: SAMPLE_HI - SAMPLE_LO + 1 }, (_, i) => SAMPLE_LO + i);
    let done = 0;
    // 기타 가운데 음부터 (첫 재생에 자주 쓰는 음)
    todo.sort((a, b) => Math.abs(a - 57) - Math.abs(b - 57));
    const one = async (m: number) => {
      const res = await fetch(base + m + '.mp3');
      if (!res.ok) throw new Error(String(res.status));
      const buffer = await ctx.decodeAudioData(await res.arrayBuffer());
      // 소리 시작 전 빈 곳 건너뛰기
      const d = buffer.getChannelData(0);
      let i = 0;
      while (i < d.length && Math.abs(d[i]) < 0.008) i++;
      this.bufs.set(m, { buffer, offset: Math.max(0, i / buffer.sampleRate - 0.002) });
      done++;
      this.progress = done / todo.length;
      this.listeners.forEach((f) => f());
    };
    this.loading = (async () => {
      for (let k = 0; k < todo.length; k += 6) await Promise.all(todo.slice(k, k + 6).map((m) => one(m).catch(() => { this.failed = true; })));
      this.listeners.forEach((f) => f());
    })();
    return this.loading;
  }

  /** 가장 가까운 녹음 + 재생 속도 (A4 기준 음높이 반영). 없으면 null */
  get(midi: number, a4 = 440): { buffer: AudioBuffer; offset: number; rate: number } | null {
    if (midi < SAMPLE_LO - 7 || midi > SAMPLE_HI + 7) return null;
    let best: number | null = null;
    for (let d = 0; d <= 7 && best === null; d++) {
      if (this.bufs.has(midi - d)) best = midi - d;
      else if (this.bufs.has(midi + d)) best = midi + d;
    }
    if (best === null) return null;
    const s = this.bufs.get(best)!;
    return { ...s, rate: Math.pow(2, (midi - best) / 12) * (a4 / 440) };
  }
}
export const samples = new SampleBank();
