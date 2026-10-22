import { chromaFromMags, cosine, noteTemplate } from './chroma';

export interface Onset {
  /** AudioContext 시각 */
  time: number;
  strength: number;
  /** 새로 들어온 음의 음이름(0=C). 잘 모르겠으면 null */
  pc: number | null;
  /** 새로 들어온 소리의 12음 세기 */
  chroma: number[];
  /** 새로 들어온 소리 중 250Hz 아래(굵은 줄 기본음) 비율 0~1 — 다운 스트로크가 큼 */
  lowShare: number;
  /** 새로 들어온 소리의 무게중심 (Hz) */
  centroid: number;
}

/**
 * 스펙트럼 플럭스(새로 커진 주파수 성분의 합)로 소리 시작을 찾습니다.
 * 프레임마다 push. 문턱은 최근 값들의 중앙값에 맞춰 움직임.
 */
export class OnsetDetector {
  private prevLog: Float32Array | null = null;
  private prevMag: Float32Array | null = null;
  private hist: number[] = [];
  private lastOnset = -Infinity;
  private prevFlux = 0;
  /** 음 이름은 시작 뒤 조금 기다렸다가 (새 음이 분석 창에 다 들어오게) 정함 */
  private pending: { time: number; strength: number; base: Float32Array } | null = null;
  /** 음 이름을 정하기까지 기다리는 시간 (초) */
  settle = 0.06;
  /** 같은 소리를 두 번 세지 않는 간격 (초) */
  refractory = 0.07;
  /** 민감도: 클수록 작은 소리도 셈 */
  sensitivity = 1;

  reset() { this.prevLog = null; this.prevMag = null; this.hist = []; this.lastOnset = -Infinity; this.prevFlux = 0; this.pending = null; }

  push(mags: Float32Array, time: number, sampleRate: number, fftSize: number, suppressed = false, a4 = 440): Onset | null {
    const binHz = sampleRate / fftSize;
    const k0 = Math.max(1, Math.floor(60 / binHz)), k1 = Math.min(mags.length - 1, Math.ceil(6000 / binHz));
    const n = mags.length;
    const L = new Float32Array(n);
    let energy = 0;
    for (let k = k0; k <= k1; k++) { L[k] = Math.log1p(1000 * mags[k]); energy += mags[k] * mags[k]; }
    let flux = 0;
    if (this.prevLog) for (let k = k0; k <= k1; k++) { const d = L[k] - this.prevLog[k]; if (d > 0) flux += d; }
    flux /= k1 - k0 + 1;
    const prevMag = this.prevMag;
    this.prevLog = L;
    this.prevMag = Float32Array.from(mags);
    const sorted = [...this.hist].sort((a, b) => a - b);
    const med = sorted.length ? sorted[sorted.length >> 1] : 0;
    this.hist.push(flux);
    if (this.hist.length > 40) this.hist.shift();
    const rising = flux > this.prevFlux;
    this.prevFlux = flux;
    // 기다리던 시작의 음 이름 정하기
    let done: Onset | null = null;
    if (this.pending && time - this.pending.time >= this.settle) done = this.resolve(mags, sampleRate, fftSize, a4);
    if (!prevMag || suppressed) return done;
    const thr = med * 2.2 + 0.08 / this.sensitivity;
    const loud = 10 * Math.log10(energy + 1e-20) > -75;
    if (flux < thr || !rising || !loud || time - this.lastOnset < this.refractory) return done;
    this.lastOnset = time;
    // 앞 시작이 아직 안 끝났으면 지금 프레임으로 정함 (빠른 음)
    if (this.pending) done = this.resolve(mags, sampleRate, fftSize, a4);
    this.pending = { time, strength: flux, base: prevMag };
    return done;
  }

  /** 끝에 남은 시작 (멈출 때) */
  flush(mags: Float32Array, sampleRate: number, fftSize: number, a4 = 440): Onset | null {
    return this.pending ? this.resolve(mags, sampleRate, fftSize, a4) : null;
  }

  private resolve(mags: Float32Array, sampleRate: number, fftSize: number, a4: number): Onset {
    const p = this.pending!;
    this.pending = null;
    const n = mags.length;
    const diff = new Float32Array(n);
    for (let k = 0; k < n; k++) diff[k] = Math.max(0, mags[k] - p.base[k]);
    const chroma = chromaFromMags(diff, sampleRate, fftSize, a4);
    let best = -1, bestS = 0;
    for (let q = 0; q < 12; q++) {
      const s = cosine(chroma, noteTemplate(q));
      if (s > bestS) { bestS = s; best = q; }
    }
    const binHz = sampleRate / fftSize;
    let lo = 0, tot = 0, wsum = 0;
    for (let k = Math.ceil(70 / binHz); k < n && k * binHz < 5000; k++) {
      const e = diff[k] * diff[k];
      tot += e; wsum += e * k * binHz;
      if (k * binHz < 250) lo += e;
    }
    return { time: p.time, strength: p.strength, pc: best >= 0 && bestS > 0.55 ? best : null, chroma, lowShare: tot ? lo / tot : 0, centroid: tot ? wsum / tot : 0 };
  }
}

/** 새로 들어온 소리가 이 음(들)과 맞는지: 가장 비슷한 음이거나, 그 점수의 85% 이상 */
export function matchesNotes(chroma: number[], pcs: number[]): boolean {
  if (!pcs.length) return true;
  let best = 0;
  for (let q = 0; q < 12; q++) best = Math.max(best, cosine(chroma, noteTemplate(q)));
  if (best <= 0) return false;
  const want = pcs.length === 1 ? cosine(chroma, noteTemplate(pcs[0])) : cosine(chroma, chordLike(pcs));
  return want >= best * 0.85;
}
function chordLike(pcs: number[]): number[] {
  const t = new Array(12).fill(0);
  for (const p of pcs) noteTemplate(p).forEach((v, i) => { t[i] += v; });
  return t;
}

/** 여러 음이 함께 들어올 때 이 음이 들어 있는지 (가장 비슷한 음 점수의 75% 이상) */
export function containsNote(chroma: number[], pc: number): boolean {
  let best = 0;
  for (let q = 0; q < 12; q++) best = Math.max(best, cosine(chroma, noteTemplate(q)));
  return best > 0 && cosine(chroma, noteTemplate(pc)) >= best * 0.75;
}

/** 음이 뚜렷한 정도 0~1 (가장 비슷한 한 음 모양과의 일치). 몸통 치기·뮤트는 낮음 */
export function tonality(chroma: number[]): number {
  let best = 0;
  for (let q = 0; q < 12; q++) best = Math.max(best, cosine(chroma, noteTemplate(q)));
  return best;
}
