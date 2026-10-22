import { resumeAudio } from './context';
import { playClick, type ClickSound } from './metronome';
import { clearClicks } from './clicks';
import { outputLatency } from './latency';
import type { TickKind } from './schedule';

/** 박(beat) 단위로 놓인 사건. play 는 소리 예약, 나머지는 화면용 */
export interface SeqEvent<T = unknown> { beat: number; play?: (ctx: AudioContext, when: number) => void; data?: T }

export interface SeqOptions<T> {
  bpm: number;
  /** 한 바퀴 길이(박). 주면 반복 */
  loopBeats?: number;
  /** 반복 없이 끝나는 길이(박) */
  endBeats?: number;
  /** 한 마디 박 수 (클릭 강세) */
  meterBeats: number;
  /** 시작 전 셈 (박) */
  countIn?: number;
  click?: boolean;
  clickSound?: ClickSound;
  clickVolume?: number;
  /** 사건이 들리는 때에 맞춰 부름 (lap = 몇 번째 바퀴) */
  onEvent?: (e: SeqEvent<T>, lap: number) => void;
  /** 박마다 (셈 포함, beat < 0 이면 셈) */
  onBeat?: (beat: number, lap: number) => void;
  onEnd?: () => void;
}

const LOOKAHEAD = 0.12;

/** 오디오 시계로 미리 예약하는 재생기 (패턴·곡·전환 연습 공용) */
export class Sequencer<T = unknown> {
  private ctx: AudioContext | null = null;
  private worker: Worker | null = null;
  private events: SeqEvent<T>[] = [];
  private o!: SeqOptions<T>;
  private startTime = 0;
  private nextIdx = 0;
  private lap = 0;
  private nextBeat = 0;
  private timeouts: ReturnType<typeof setTimeout>[] = [];
  running = false;

  /** 박 → AudioContext 시각 (셈 포함) */
  timeOf(beat: number, lap = 0): number {
    const spb = 60 / this.o.bpm;
    return this.startTime + ((this.o.countIn ?? 0) + lap * (this.o.loopBeats ?? 0) + beat) * spb;
  }
  get secondsPerBeat() { return 60 / this.o.bpm; }
  get t0() { return this.startTime + (this.o.countIn ?? 0) * (60 / this.o.bpm); }

  async start(events: SeqEvent<T>[], o: SeqOptions<T>) {
    this.stop();
    const ctx = await resumeAudio();
    this.ctx = ctx;
    // 반복이면 한 바퀴 안의 사건만 (없으면 박·클릭만)
    this.events = events.filter((e) => !o.loopBeats || e.beat < o.loopBeats).sort((a, b) => a.beat - b.beat);
    this.o = o;
    this.startTime = ctx.currentTime + 0.1;
    this.nextIdx = 0;
    this.lap = 0;
    this.nextBeat = -(o.countIn ?? 0);
    this.running = true;
    if (!this.worker) {
      this.worker = new Worker(new URL('./tickWorker.ts', import.meta.url), { type: 'module' });
      this.worker.onmessage = () => this.pump();
    }
    this.worker.postMessage('start');
    this.pump();
  }

  stop() {
    if (!this.running && !this.timeouts.length) return;
    this.running = false;
    this.worker?.postMessage('stop');
    this.timeouts.forEach(clearTimeout);
    this.timeouts = [];
    clearClicks();
  }

  private later(when: number, fn: () => void) {
    const ctx = this.ctx!;
    const h = setTimeout(() => { this.timeouts = this.timeouts.filter((x) => x !== h); fn(); }, Math.max(0, (when - ctx.currentTime + outputLatency()) * 1000));
    this.timeouts.push(h);
  }

  private pump() {
    const ctx = this.ctx;
    if (!this.running || !ctx) return;
    const o = this.o;
    const until = ctx.currentTime + LOOKAHEAD;
    const loop = o.loopBeats;
    // 박 (클릭 + onBeat)
    for (;;) {
      const b = this.nextBeat;
      const lap = loop && b >= 0 ? Math.floor(b / loop) : 0;
      const inLap = loop && b >= 0 ? b - lap * loop : b;
      const when = this.timeOf(inLap, lap);
      if (when >= until) break;
      if (!loop && o.endBeats !== undefined && b >= o.endBeats) break;
      if (o.click || b < 0) {
        const pos = ((b % o.meterBeats) + o.meterBeats) % o.meterBeats;
        const kind: TickKind = pos === 0 && o.meterBeats > 1 ? 'accent' : 'beat';
        playClick(ctx, when, kind, o.clickSound ?? 'wood', o.clickVolume ?? 0.7);
      }
      if (o.onBeat) { const cb = o.onBeat; this.later(when, () => cb(inLap, lap)); }
      this.nextBeat++;
    }
    // 사건
    for (;;) {
      if (this.nextIdx >= this.events.length) {
        if (loop) { if (!this.events.length) break; this.lap++; this.nextIdx = 0; continue; }
        // 끝
        const endAt = this.timeOf(o.endBeats ?? (this.events.at(-1)?.beat ?? 0) + 1);
        if (endAt < until) {
          this.later(endAt, () => { this.stop(); o.onEnd?.(); });
          this.running = false; // 더 예약하지 않음 (예약된 화면 갱신은 남김)
          this.worker?.postMessage('stop');
        }
        break;
      }
      const e = this.events[this.nextIdx];
      const when = this.timeOf(e.beat, this.lap);
      if (when >= until) break;
      e.play?.(ctx, when);
      if (o.onEvent) { const cb = o.onEvent; const lap = this.lap; this.later(when, () => cb(e, lap)); }
      this.nextIdx++;
    }
  }
}
