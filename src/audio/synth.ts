import { resumeAudio } from './context';
import { ksSamples } from './pluck';
import { midiToFreq } from './notes';

/** 기타 소리: 줄마다 한 음씩 (같은 줄에 새 음이 오면 앞 음을 멈춤) */
class GuitarSynth {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null;
  private cache = new Map<string, AudioBuffer>();
  private voices = new Map<number, { src: AudioBufferSourceNode; g: GainNode }>();
  private all = new Set<AudioBufferSourceNode>();
  private noise: AudioBuffer | null = null;
  private pan: StereoPannerNode | null = null;
  a4 = 440;
  volume = 0.9;

  async ready(): Promise<AudioContext> {
    const ctx = await resumeAudio();
    this.setup(ctx);
    return ctx;
  }
  /** 이미 resume 된 ctx 로 (예약 재생 안에서) */
  setup(ctx: AudioContext) {
    if (this.ctx === ctx && this.bus) return;
    this.ctx = ctx;
    const g = ctx.createGain();
    g.gain.value = this.volume;
    // 몸통 울림 비슷하게: 낮은 쪽 살짝 올리고 아주 높은 쪽은 깎음
    const body = ctx.createBiquadFilter();
    body.type = 'peaking'; body.frequency.value = 110; body.Q.value = 1.2; body.gain.value = 4;
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass'; air.frequency.value = 7000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 4;
    const pan = ctx.createStereoPanner();
    this.pan = pan;
    g.connect(body).connect(air).connect(comp).connect(pan).connect(ctx.destination);
    this.bus = g;
  }
  /** 좌우 (-1 왼쪽 … 1 오른쪽). 녹음과 겹쳐 들을 때 */
  setPan(p: number) { if (this.pan) this.pan.pan.value = p; }
  setVolume(v: number) { this.volume = v; if (this.bus) this.bus.gain.value = v; }

  private buffer(midi: number, bright: number): AudioBuffer {
    const ctx = this.ctx!;
    const key = `${midi}:${bright.toFixed(2)}:${this.a4}`;
    let b = this.cache.get(key);
    if (!b) {
      const s = ksSamples(midiToFreq(midi, this.a4), ctx.sampleRate, { bright });
      b = ctx.createBuffer(1, s.length, ctx.sampleRate);
      b.copyToChannel(s, 0);
      this.cache.set(key, b);
      if (this.cache.size > 120) this.cache.delete(this.cache.keys().next().value!);
    }
    return b;
  }

  /** 한 음. string(0=6번 줄 … 5=1번 줄)을 주면 그 줄의 앞 음을 멈춤 */
  note(midi: number, when: number, vel = 0.8, string?: number, bright = 0.55) {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    const t = Math.max(when, ctx.currentTime);
    if (string !== undefined) this.choke(string, t);
    const src = ctx.createBufferSource();
    src.buffer = this.buffer(Math.round(midi), bright);
    const g = ctx.createGain();
    g.gain.value = vel * 0.32;
    src.connect(g).connect(this.bus);
    src.start(t);
    this.all.add(src);
    src.onended = () => { this.all.delete(src); };
    if (string !== undefined) this.voices.set(string, { src, g });
  }

  choke(string: number, when: number) {
    const v = this.voices.get(string);
    if (!v) return;
    try {
      v.g.gain.setValueAtTime(v.g.gain.value, when);
      v.g.gain.linearRampToValueAtTime(0, when + 0.03);
      v.src.stop(when + 0.04);
    } catch { /* 이미 멈춤 */ }
    this.voices.delete(string);
  }

  /**
   * 긁기. midis: 6번 줄부터 1번 줄까지 (null = 안 치는 줄).
   * down: 낮은 줄 → 높은 줄, up: 높은 줄 → 낮은 줄(위 네 줄만)
   */
  strum(midis: (number | null)[], when: number, dir: 'down' | 'up' = 'down', vel = 0.8, spread = 0.014) {
    const idx = midis.map((m, i) => (m === null ? -1 : i)).filter((i) => i >= 0);
    const order = dir === 'down' ? idx : idx.slice().reverse().slice(0, 4);
    order.forEach((s, k) => this.note(midis[s]!, when + k * spread, vel * (dir === 'up' ? 0.75 : 1) * (1 - k * 0.03), s, dir === 'up' ? 0.7 : 0.55));
  }

  /** 소리 죽이기(뮤트 긁기): 줄을 모두 멈추고 짧은 '착' 소리 */
  chuck(when: number, vel = 0.7) {
    for (let s = 0; s < 6; s++) this.choke(s, when);
    this.thump(when, vel, 1800, 0.03);
  }
  /** 하모닉스: 맑은 종소리 (사인파 + 약한 배음) */
  harm(midi: number, when: number, vel = 0.8, string?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    const t = Math.max(when, ctx.currentTime);
    if (string !== undefined) this.choke(string, t);
    const f = midiToFreq(midi, this.a4);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0008, t + 2.6);
    g.connect(this.bus);
    for (const [mul, amp] of [[1, 1], [2, 0.18], [3, 0.06]] as const) {
      const osc = ctx.createOscillator();
      osc.frequency.value = f * mul;
      const og = ctx.createGain();
      og.gain.value = amp;
      osc.connect(og).connect(g);
      osc.start(t); osc.stop(t + 2.7);
    }
  }
  /** 엄지 슬랩: 낮은 줄이 프렛에 부딪히는 '짝' (줄 소리 멈춤) */
  slap(when: number, vel = 0.8) {
    this.choke(0, when); this.choke(1, when);
    this.thump(when, vel * 0.9, 140, 0.07);
    this.thump(when, vel * 0.7, 2600, 0.035);
  }
  /** 퍼커시브 히트: 몸통 '쿵' */
  hit(when: number, vel = 0.8) { this.thump(when, vel, 180, 0.09); }

  private thump(when: number, vel: number, freq: number, dur: number) {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    if (!this.noise) {
      const len = Math.floor(ctx.sampleRate * 0.12);
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len / 5));
    }
    const t = Math.max(when, ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 1.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vel * 1.6, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.bus);
    src.start(t); src.stop(t + dur + 0.02);
  }

  stopAll() {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const s of this.all) { try { s.stop(); } catch { /* 무시 */ } }
    this.all.clear();
    this.voices.clear();
  }
}

export const synth = new GuitarSynth();
