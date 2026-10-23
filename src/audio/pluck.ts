/**
 * 카플러스-스트롱 줄 소리. 잡음을 줄 길이만큼 되먹여 쇠줄 기타 비슷한 소리를 만듭니다.
 * 소수점 지연은 올패스 필터로 맞춰서 높은 음도 음정이 정확합니다.
 */
export interface PluckOpts {
  seconds?: number;
  /** 0~1: 클수록 밝은 소리 (피크로 친 느낌) */
  bright?: number;
  /** 0~1: 줄을 튕기는 위치 (브릿지에서 줄 길이 비율) */
  pickPos?: number;
  /** 소리가 1/1000 로 줄어드는 시간 (초). 비우면 음높이로 정함 */
  t60?: number;
  seed?: number;
}

function rng(seed: number) {
  let s = (Math.imul(seed | 0, 2654435761) ^ 0x9e3779b9) >>> 0 || 1;
  const next = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return s; };
  for (let i = 0; i < 16; i++) next();
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) / 4294967296) * 2 - 1; };
}

/** 줄 하나(한 방향 진동)의 카플러스-스트롱. S = 손실 필터 (0.5 = 평균, 작을수록 높은 소리가 오래 남음) */
function ksCore(freq: number, sampleRate: number, len: number, init: (N: number) => Float32Array, t60: number, S: number): Float32Array {
  const out = new Float32Array(len);
  const P = sampleRate / freq;
  // 고리 지연 = N + S(손실 필터) + d(올패스)
  const N = Math.max(2, Math.floor(P - S - 0.1));
  const d = P - S - N;
  const C = (1 - d) / (1 + d);
  const rho = Math.pow(10, -3 / (t60 * freq));
  const buf = init(N);
  let idx = 0, prev = 0, apX = 0, apY = 0;
  for (let n = 0; n < len; n++) {
    const cur = buf[idx];
    out[n] = cur;
    const lossy = ((1 - S) * cur + S * prev) * rho;
    prev = cur;
    const y = C * lossy + apX - C * apY;
    apX = lossy; apY = y;
    buf[idx] = y;
    idx = idx === N - 1 ? 0 : idx + 1;
  }
  return out;
}

export interface PluckMore extends PluckOpts {
  /** 감은 줄(4·5·6번): 조금 어둡고 길게 */
  wound?: boolean;
  /** 하모닉스: 피크 잡음 없이, 맑고 길게 */
  harmonic?: boolean;
}

export function ksSamples(freq: number, sampleRate: number, o: PluckMore = {}): Float32Array {
  const seconds = o.seconds ?? 2.5;
  const harm = !!o.harmonic;
  const bright = (o.bright ?? 0.55) * (o.wound ? 0.82 : 1) * (harm ? 0.35 : 1);
  const len = Math.floor(seconds * sampleRate);
  let t60 = o.t60 ?? Math.max(0.9, Math.min(4.5, 6.5 - 1.6 * Math.log2(freq / 82)));
  if (o.wound) t60 *= 1.1;
  if (harm) t60 *= 1.5;
  const rand = rng(o.seed ?? Math.round(freq * 1000));
  const pick = o.pickPos ?? (harm ? 0.3 : 0.13);
  // 처음 잡음: 낮은 통과로 밝기 + 튕기는 위치 빗살 필터 (평균 0)
  // 두 방향 모두 같은 튕김에서 시작 (N 이 같으면 같은 잡음)
  const made = new Map<number, Float32Array>();
  const init = (N: number) => {
    const got = made.get(N);
    if (got) return got.slice();
    const raw = new Float32Array(N);
    let lp = 0;
    const a = 0.12 + 0.8 * bright;
    for (let i = 0; i < N; i++) { lp += a * (rand() - lp); raw[i] = lp; }
    if (harm) { let lp2 = 0; for (let i = 0; i < N; i++) { lp2 += 0.5 * (raw[i] - lp2); raw[i] = lp2; } }
    const pp = Math.max(1, Math.round(pick * N));
    const buf = new Float32Array(N);
    for (let i = 0; i < N; i++) buf[i] = raw[i] - (i >= pp ? raw[i - pp] : 0) * 0.9;
    let mean = 0;
    for (let i = 0; i < N; i++) mean += buf[i];
    mean /= N;
    for (let i = 0; i < N; i++) buf[i] -= mean;
    made.set(N, buf.slice());
    return buf;
  };
  // 두 방향 진동(가로·세로)을 아주 조금 다른 음높이·감쇠로 섞어 살아 있는 울림
  const S = o.wound ? 0.5 : 0.44;
  const a = ksCore(freq * 1.0002, sampleRate, len, init, t60, S);
  const b = ksCore(freq * 0.9998, sampleRate, len, init, t60 * 0.8, S + 0.03);
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) out[i] = 0.62 * a[i] + 0.38 * b[i];
  // 피크가 줄을 긁는 짧은 소리 (하모닉스는 없음)
  if (!harm) {
    const n = Math.floor(0.004 * sampleRate);
    let hp = 0, last = 0;
    for (let i = 0; i < n; i++) { const x = rand(); hp = 0.7 * (hp + x - last); last = x; out[i] += hp * 0.1 * bright * (1 - i / n); }
  }
  let peak = 0;
  for (let i = 0; i < len; i++) { const ab = Math.abs(out[i]); if (ab > peak) peak = ab; }
  // 처음 부드럽게 (하모닉스는 손가락을 떼는 만큼 조금 더), 마지막 50ms 페이드
  const fi = Math.floor((harm ? 0.006 : 0.0015) * sampleRate), fo = Math.floor(0.05 * sampleRate);
  for (let i = 0; i < fi; i++) out[i] *= i / fi;
  for (let i = 0; i < fo; i++) out[len - 1 - i] *= i / fo;
  if (peak > 0) for (let i = 0; i < len; i++) out[i] /= peak;
  return out;
}
