import { resumeAudio } from './context';
import { ksSamples } from './pluck';
import { midiToFreq } from './notes';
import { bodyImpulse } from './body';
import { samples } from './samples';

export type GuitarVoice = 'sample' | 'synth';

/**
 * 기타 소리: 줄마다 한 음씩 (같은 줄에 새 음이 오면 앞 음을 멈춤).
 * - synth: 카플러스-스트롱 (두 방향 진동, 감은 줄/민 줄) + 몸통 울림(합성 임펄스 응답)
 * - sample: 실제 스틸 기타 녹음 (FluidR3_GM, CC BY 3.0). 못 받았으면 synth 로
 * 하모닉스·슬랩·몸통 치기는 언제나 합성
 */
class GuitarSynth {
  private ctx: AudioContext | null = null;
  private bus: GainNode | null = null; // 합성 줄 → 몸통
  private sbus: GainNode | null = null; // 녹음 소리 (몸통 이미 들어 있음)
  private master: GainNode | null = null;
  private cache = new Map<string, AudioBuffer>();
  private voices = new Map<number, { src: AudioBufferSourceNode; g: GainNode }>();
  private all = new Set<AudioBufferSourceNode>();
  private noise: AudioBuffer | null = null;
  private pan: StereoPannerNode | null = null;
  a4 = 440;
  volume = 0.9;
  voice: GuitarVoice = 'sample';

  async ready(): Promise<AudioContext> {
    const ctx = await resumeAudio();
    this.setup(ctx);
    if (this.voice === 'sample') samples.load(ctx).catch(() => {});
    return ctx;
  }
  /** 이미 resume 된 ctx 로 (예약 재생 안에서) */
  setup(ctx: AudioContext) {
    if (this.ctx === ctx && this.bus) return;
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = this.volume;
    const air = ctx.createBiquadFilter();
    air.type = 'lowpass'; air.frequency.value = 9000;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.2;
    const pan = ctx.createStereoPanner();
    this.pan = pan;
    master.connect(air).connect(comp).connect(pan).connect(ctx.destination);
    // 합성 줄: 마른 소리 + 몸통(합성 임펄스) 울림
    const bus = ctx.createGain();
    const dry = ctx.createGain(); dry.gain.value = 0.7;
    const conv = ctx.createConvolver();
    conv.normalize = true;
    conv.buffer = bodyImpulse(ctx);
    const wet = ctx.createGain(); wet.gain.value = 0.55;
    const low = ctx.createBiquadFilter(); // 줄 소리의 아주 낮은 웅웅거림 정리
    low.type = 'highpass'; low.frequency.value = 60;
    bus.connect(low);
    low.connect(dry).connect(master);
    low.connect(conv).connect(wet).connect(master);
    const sbus = ctx.createGain();
    sbus.gain.value = 1.6;
    sbus.connect(master);
    this.bus = bus; this.sbus = sbus; this.master = master;
  }
  setVolume(v: number) { this.volume = v; if (this.master) this.master.gain.value = v; }
  setVoice(v: GuitarVoice) { this.voice = v; if (v === 'sample' && this.ctx) samples.load(this.ctx).catch(() => {}); }
  /** 좌우 (-1 왼쪽 … 1 오른쪽). 녹음과 겹쳐 들을 때 */
  setPan(p: number) { if (this.pan) this.pan.pan.value = p; }

  private buffer(midi: number, bright: number, wound: boolean, harmonic = false): AudioBuffer {
    const ctx = this.ctx!;
    const key = `${midi}:${bright.toFixed(2)}:${this.a4}:${wound ? 'w' : 'p'}${harmonic ? 'h' : ''}`;
    let b = this.cache.get(key);
    if (!b) {
      const s = ksSamples(midiToFreq(midi, this.a4), ctx.sampleRate, { bright, wound, harmonic, seconds: harmonic ? 3.5 : 2.5 });
      b = ctx.createBuffer(1, s.length, ctx.sampleRate);
      b.copyToChannel(s, 0);
      this.cache.set(key, b);
      if (this.cache.size > 160) this.cache.delete(this.cache.keys().next().value!);
    }
    return b;
  }

  /** 줄 위치 → 살짝 좌우 (6번 줄 왼쪽, 1번 줄 오른쪽) */
  private place(string: number | undefined, midi: number): number { return ((string ?? (midi < 50 ? 0 : midi < 60 ? 2 : 4)) - 2.5) * 0.06; }

  private start(src: AudioBufferSourceNode, g: GainNode, dest: AudioNode, t: number, string: number | undefined, midi: number, offset = 0, filter?: AudioNode) {
    const ctx = this.ctx!;
    const p = ctx.createStereoPanner();
    p.pan.value = this.place(string, midi);
    if (filter) src.connect(filter).connect(g); else src.connect(g);
    g.connect(p).connect(dest);
    src.start(t, offset);
    this.all.add(src);
    src.onended = () => { this.all.delete(src); };
    if (string !== undefined) this.voices.set(string, { src, g });
  }

  /** 한 음. string(0=6번 줄 … 5=1번 줄)을 주면 그 줄의 앞 음을 멈춤 */
  note(midi: number, when: number, vel = 0.8, string?: number, bright = 0.55) {
    const ctx = this.ctx;
    if (!ctx || !this.bus || !this.sbus) return;
    const t = Math.max(when, ctx.currentTime);
    if (string !== undefined) this.choke(string, t);
    const m = Math.round(midi);
    const smp = this.voice === 'sample' ? samples.get(m, this.a4) : null;
    if (smp) {
      const src = ctx.createBufferSource();
      src.buffer = smp.buffer;
      src.playbackRate.value = smp.rate;
      const g = ctx.createGain();
      // 세게 칠수록 크고 밝게: 약하면 높은 소리를 깎음
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = 1800 + 9000 * Math.min(1, vel * (0.6 + bright));
      g.gain.value = Math.pow(vel, 1.3) * 0.5;
      this.start(src, g, this.sbus, t, string, m, smp.offset, f);
      return;
    }
    const src = ctx.createBufferSource();
    const wound = string !== undefined ? string <= 2 : m < 52;
    src.buffer = this.buffer(m, Math.round(Math.min(1, bright * (0.7 + vel * 0.4)) * 20) / 20, wound);
    const g = ctx.createGain();
    g.gain.value = vel * 0.32;
    this.start(src, g, this.bus, t, string, m);
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
    order.forEach((s, k) => this.note(midis[s]!, when + k * spread * (0.85 + 0.3 * Math.random()), vel * (dir === 'up' ? 0.75 : 1) * (1 - k * 0.03), s, dir === 'up' ? 0.7 : 0.55));
  }

  /** 소리 죽이기(뮤트 긁기): 줄을 모두 멈추고 짧은 '착' 소리 */
  chuck(when: number, vel = 0.7) {
    for (let s = 0; s < 6; s++) this.choke(s, when);
    this.thump(when, vel, 1800, 0.03);
  }
  /**
   * 하모닉스: 줄 마디(1/2·1/3·1/4)를 대면 그 배음만 남으니, 그 음높이로 줄 소리를 만들되
   * 피크 잡음 없이·맑게·길게. 몸통 울림을 거쳐 실제 기타처럼.
   */
  harm(midi: number, when: number, vel = 0.8, string?: number) {
    const ctx = this.ctx;
    if (!ctx || !this.bus) return;
    const t = Math.max(when, ctx.currentTime);
    if (string !== undefined) this.choke(string, t);
    const m = Math.round(midi);
    const src = ctx.createBufferSource();
    src.buffer = this.buffer(m, 0.5, false, true);
    const g = ctx.createGain();
    g.gain.value = vel * 0.3;
    this.start(src, g, this.bus, t, string, m);
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
