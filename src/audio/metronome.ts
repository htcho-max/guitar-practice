import { resumeAudio } from './context';
import { TickScheduler, type Tick, type Meter, type TickKind } from './schedule';
import { noteClick, clearClicks } from './clicks';
import { outputLatency } from './latency';

export type ClickSound = 'beep' | 'wood';
const LOOKAHEAD = 0.1;

let noise: AudioBuffer | null = null;
/** 클릭 한 번 (메트로놈·패턴·곡 재생이 같이 씀) */
export function playClick(ctx: AudioContext, t: number, kind: TickKind, sound: ClickSound, volume: number) {
  if (!noise) {
    const len = Math.floor(ctx.sampleRate * 0.05);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  }
  const level = { accent: 1, secondary: 0.8, beat: 0.65, sub: 0.35 }[kind] * volume;
  const g = ctx.createGain();
  g.connect(ctx.destination);
  if (sound === 'beep') {
    const osc = ctx.createOscillator();
    osc.frequency.value = { accent: 1760, secondary: 1480, beat: 1320, sub: 990 }[kind];
    g.gain.setValueAtTime(level, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
    osc.connect(g);
    osc.start(t);
    osc.stop(t + 0.06);
  } else {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = { accent: 2600, secondary: 2200, beat: 1800, sub: 1400 }[kind];
    bp.Q.value = 4;
    g.gain.setValueAtTime(level * 3, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
    src.connect(bp).connect(g);
    src.start(t);
    src.stop(t + 0.05);
  }
  noteClick(t);
}

class Metronome {
  core = new TickScheduler();
  sound: ClickSound = 'wood';
  volume = 0.8;
  private ctx: AudioContext | null = null;
  private worker: Worker | null = null;
  private visualListeners = new Set<(t: Tick) => void>();
  private stateListeners = new Set<(on: boolean) => void>();
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  running = false;

  async start() {
    if (this.running) return;
    const ctx = await resumeAudio();
    this.ctx = ctx;
    this.core.reset(ctx.currentTime + 0.08);
    this.running = true;
    this.stateListeners.forEach((f) => f(true));
    if (!this.worker) {
      this.worker = new Worker(new URL('./tickWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = () => this.pump();
    }
    this.worker.postMessage('start');
    this.pump();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.worker?.postMessage('stop');
    this.timeouts.forEach(clearTimeout);
    this.timeouts = [];
    clearClicks();
    this.stateListeners.forEach((f) => f(false));
  }

  setBpm(b: number) { this.core.bpm = b; }
  setMeter(m: Meter) { this.core.meter = m; }
  setSubdivision(n: number) { this.core.subdivision = n; }
  setAccent(a: boolean) { this.core.accent = a; }
  /** 다음 클릭 시각 (AudioContext 시간) — 전환 연습이 박에 맞추는 데 씀 */
  get nextTime() { return this.core.nextTime; }

  onTick(fn: (t: Tick) => void): () => void {
    this.visualListeners.add(fn);
    return () => { this.visualListeners.delete(fn); };
  }
  onState(fn: (on: boolean) => void): () => void {
    this.stateListeners.add(fn);
    return () => { this.stateListeners.delete(fn); };
  }

  private pump() {
    const ctx = this.ctx;
    if (!this.running || !ctx) return;
    for (const tick of this.core.advance(ctx.currentTime + LOOKAHEAD)) {
      playClick(ctx, tick.time, tick.kind, this.sound, this.volume);
      const delay = Math.max(0, (tick.time - ctx.currentTime + outputLatency()) * 1000);
      const h = setTimeout(() => {
        this.timeouts = this.timeouts.filter((x) => x !== h);
        this.visualListeners.forEach((fn) => fn(tick));
      }, delay);
      this.timeouts.push(h);
    }
  }
}

export const metronome = new Metronome();
