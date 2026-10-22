import { PitchDetector } from 'pitchy';
import { getAudioContext, resumeAudio } from './context';
import { analyzeFrame } from './analyze';
import { MedianWindow } from './smoothing';
import { clickNear } from './clicks';
import { chromaFromMags } from './chroma';
import { dbToMag } from './fft';
import { OnsetDetector, type Onset } from './onset';

export interface PitchReading { freq: number | null; db: number; clarity: number; time: number }

const BUFFER = 4096; // 음높이 (6번 줄 E2 82Hz 도 잡히게)
const CHROMA_FFT = 16384; // 코드 판정 (낮은 음까지 반음 구별)
const ONSET_FFT = 2048; // 소리 시작 (시간 해상도)

/** 마이크 하나를 여러 화면이 같이 씀: 음높이(튜너·한 줄씩), 크로마(코드 판정), 소리 시작(따라 치기) */
class Mic {
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private pitchAn: AnalyserNode | null = null;
  private chromaAn: AnalyserNode | null = null;
  private onsetAn: AnalyserNode | null = null;
  private detector = PitchDetector.forFloat32Array(BUFFER);
  private buf = new Float32Array(BUFFER);
  private chromaDb = new Float32Array(CHROMA_FFT / 2);
  private chromaMag = new Float32Array(CHROMA_FFT / 2);
  private onsetDb = new Float32Array(ONSET_FFT / 2);
  private onsetMag = new Float32Array(ONSET_FFT / 2);
  private median = new MedianWindow(5);
  private raf = 0;
  private listeners = new Set<(r: PitchReading) => void>();
  private onsetListeners = new Set<(o: Onset) => void>();
  private onsets = new OnsetDetector();
  private silentFrames = 0;
  private lastFreq: number | null = null;
  minDb = -55;
  a4 = 440;
  /** 마이크 지연(초): 소리 시작 시각에서 뺌 (스피커→마이크 측정값) */
  inputLatency = 0;

  get running() { return this.stream !== null; }
  /** 녹음용으로 같은 마이크 스트림 */
  get mediaStream() { return this.stream; }

  async start(): Promise<void> {
    if (this.stream) return;
    const ctx = await resumeAudio();
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    this.source = ctx.createMediaStreamSource(this.stream);
    const mk = (n: number) => { const a = ctx.createAnalyser(); a.fftSize = n; a.smoothingTimeConstant = 0; this.source!.connect(a); return a; };
    this.pitchAn = mk(BUFFER);
    this.chromaAn = mk(CHROMA_FFT);
    this.onsetAn = mk(ONSET_FFT);
    this.onsets.reset();
    this.loop();
  }

  stop() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = this.source = this.pitchAn = this.chromaAn = this.onsetAn = null;
    this.median.reset();
    this.lastFreq = null;
  }

  subscribe(fn: (r: PitchReading) => void): () => void {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  }
  /** 소리 시작(줄을 튕긴 순간). time 은 AudioContext 시각 (마이크 지연 뺀 값) */
  subscribeOnset(fn: (o: Onset) => void): () => void {
    if (!this.onsetListeners.size) this.onsets.reset();
    this.onsetListeners.add(fn);
    return () => { this.onsetListeners.delete(fn); };
  }

  /** 지금 들리는 12음 세기 */
  chroma(): number[] | null {
    const an = this.chromaAn;
    if (!an) return null;
    an.getFloatFrequencyData(this.chromaDb);
    dbToMag(this.chromaDb, this.chromaMag);
    return chromaFromMags(this.chromaMag, an.context.sampleRate, CHROMA_FFT, this.a4);
  }
  /** 지금 소리 크기 (dB) */
  level(): number {
    const an = this.pitchAn;
    if (!an) return -Infinity;
    an.getFloatTimeDomainData(this.buf);
    let s = 0;
    for (let i = 0; i < this.buf.length; i++) s += this.buf[i] * this.buf[i];
    return 10 * Math.log10(s / this.buf.length + 1e-12);
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const an = this.pitchAn;
    if (!an) return;
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    if (this.onsetListeners.size && this.onsetAn) {
      this.onsetAn.getFloatFrequencyData(this.onsetDb);
      dbToMag(this.onsetDb, this.onsetMag);
      // 창 가운데쯤을 그 프레임 시각으로
      const t = now - (ONSET_FFT / ctx.sampleRate) * 0.35 - this.inputLatency;
      const o = this.onsets.push(this.onsetMag, t, ctx.sampleRate, ONSET_FFT, clickNear(now, ONSET_FFT / ctx.sampleRate, 0.02), this.a4);
      if (o) this.onsetListeners.forEach((fn) => fn(o));
    }
    if (!this.listeners.size) return;
    an.getFloatTimeDomainData(this.buf);
    if (clickNear(now, BUFFER / ctx.sampleRate)) {
      this.emit({ freq: this.lastFreq, db: -Infinity, clarity: 0, time: now });
      return;
    }
    const r = analyzeFrame(this.detector, this.buf, ctx.sampleRate, this.minDb);
    let freq: number | null = null;
    if (r.freq !== null) {
      if (this.lastFreq && Math.abs(1200 * Math.log2(r.freq / this.lastFreq)) > 80) this.median.reset();
      freq = this.median.push(r.freq);
      this.silentFrames = 0;
    } else if (++this.silentFrames > 6) {
      this.median.reset();
    } else {
      freq = this.lastFreq;
    }
    this.lastFreq = freq;
    this.emit({ freq, db: r.db, clarity: r.clarity, time: now });
  };

  private emit(r: PitchReading) { this.listeners.forEach((fn) => fn(r)); }
}

export const mic = new Mic();
