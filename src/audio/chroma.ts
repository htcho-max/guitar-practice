import { PC_NAMES } from './notes';

/**
 * 크로마(12음 세기). 스펙트럼의 봉우리마다 주파수를 보간해서 가장 가까운 음(±45센트 안)에 에너지를 더합니다.
 * mags: 크기 스펙트럼 (k = 0..fftSize/2)
 */
export function chromaFromMags(mags: Float32Array, sampleRate: number, fftSize: number, a4 = 440, minHz = 70, maxHz = 1500): number[] {
  const out = new Array(12).fill(0);
  const binHz = sampleRate / fftSize;
  const k0 = Math.max(2, Math.floor(minHz / binHz));
  const k1 = Math.min(mags.length - 2, Math.ceil(maxHz / binHz));
  let max = 0;
  for (let k = k0; k <= k1; k++) if (mags[k] > max) max = mags[k];
  if (max <= 0) return out;
  const floor = max * 0.02;
  for (let k = k0; k <= k1; k++) {
    const m = mags[k];
    if (m < floor || m <= mags[k - 1] || m < mags[k + 1]) continue;
    // 포물선 보간 (로그 크기)
    const a = Math.log(mags[k - 1] + 1e-12), b = Math.log(m + 1e-12), c = Math.log(mags[k + 1] + 1e-12);
    const den = a - 2 * b + c;
    const off = den === 0 ? 0 : Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den));
    const f = (k + off) * binHz;
    const midi = 69 + 12 * Math.log2(f / a4);
    const near = Math.round(midi);
    const dev = Math.abs(midi - near) * 100;
    if (dev > 45) continue;
    const w = Math.exp(-(dev * dev) / (2 * 25 * 25));
    out[((near % 12) + 12) % 12] += m * m * w;
  }
  return normalize(out.map(Math.sqrt));
}

export function normalize(v: number[]): number[] {
  const n = Math.hypot(...v);
  return n > 0 ? v.map((x) => x / n) : v.map(() => 0);
}
export function cosine(a: number[], b: number[]): number {
  let s = 0, na = 0, nb = 0;
  for (let i = 0; i < 12; i++) { s += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na > 0 && nb > 0 ? s / Math.sqrt(na * nb) : 0;
}

/**
 * 배음까지 생각한 음 하나의 크로마 모양. 기타 줄은 3배음(5도)·5배음(장3도)이 셉니다.
 * (0도 1, 5도 0.55, 장3도 0.3, 장2도(9배음) 0.15, 단7도(7배음) 0.08)
 */
const HARMONIC_PCS: [number, number][] = [[0, 1], [7, 0.55], [4, 0.3], [2, 0.15], [10, 0.08]];
export function noteTemplate(p: number): number[] {
  const t = new Array(12).fill(0);
  for (const [iv, w] of HARMONIC_PCS) t[(p + iv) % 12] += w;
  return t;
}
/** 코드(음 이름 집합)의 모양 */
export function chordTemplate(pcs: number[], bass?: number): number[] {
  const t = new Array(12).fill(0);
  for (const p of pcs) noteTemplate(p).forEach((v, i) => { t[i] += v; });
  if (bass !== undefined) noteTemplate(bass).forEach((v, i) => { t[i] += 0.3 * v; });
  return normalize(t);
}

/** 들린 코드 후보 (근음 12 × 종류) */
const CANDIDATE_TYPES: { suffix: string; iv: number[] }[] = [
  { suffix: '', iv: [0, 4, 7] }, { suffix: 'm', iv: [0, 3, 7] }, { suffix: '7', iv: [0, 4, 7, 10] }, { suffix: 'm7', iv: [0, 3, 7, 10] },
  { suffix: 'maj7', iv: [0, 4, 7, 11] }, { suffix: 'sus2', iv: [0, 2, 7] }, { suffix: 'sus4', iv: [0, 5, 7] },
];
const CANDIDATES = CANDIDATE_TYPES.flatMap((t) => Array.from({ length: 12 }, (_, r) => ({
  name: PC_NAMES[r] + t.suffix, pcs: t.iv.map((i) => (r + i) % 12), tpl: chordTemplate(t.iv.map((i) => (r + i) % 12)),
})));

export interface ChordVerdict {
  /** ok: 맞음, close: 비슷함(한두 음 문제), wrong: 다른 코드 */
  verdict: 'ok' | 'close' | 'wrong';
  score: number;
  /** 가장 비슷하게 들린 코드 */
  heard: string;
  heardScore: number;
  /** 코드 음인데 잘 안 들리는 음 */
  missing: number[];
  /** 코드에 없는데 크게 들리는 음 */
  extra: number[];
}

export function judgeChord(chroma: number[], pcs: number[], bass?: number): ChordVerdict {
  const tpl = chordTemplate(pcs, bass);
  const score = cosine(chroma, tpl);
  let heard = '', heardScore = -1, heardPcs: number[] = [];
  for (const c of CANDIDATES) {
    const s = cosine(chroma, c.tpl);
    if (s > heardScore) { heardScore = s; heard = c.name; heardPcs = c.pcs; }
  }
  // 들린 코드가 목표 코드의 일부(예: Aadd9 에서 A)면 같은 코드로 봄
  const subset = heardPcs.every((p) => pcs.includes(p));
  const max = Math.max(...chroma);
  const missing = max > 0 ? pcs.filter((p) => chroma[p] < max * 0.18) : [...pcs];
  // 배음으로 설명되는 만큼을 뺀 나머지가 큰 음
  const scale = Math.max(...chroma.map((v, i) => (tpl[i] > 0.05 ? v / tpl[i] : 0)).filter(Number.isFinite)) || 1;
  const extra: number[] = [];
  for (let i = 0; i < 12; i++) {
    if (pcs.includes(i)) continue;
    if (chroma[i] - tpl[i] * scale * 0.6 > max * 0.45) extra.push(i);
  }
  let verdict: ChordVerdict['verdict'] = 'wrong';
  if (score >= 0.84 && (score >= heardScore - 0.06 || subset) && missing.length === 0) verdict = 'ok';
  else if (score >= 0.74) verdict = 'close';
  return { verdict, score, heard, heardScore, missing, extra };
}
