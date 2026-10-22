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

export function ksSamples(freq: number, sampleRate: number, o: PluckOpts = {}): Float32Array {
  const seconds = o.seconds ?? 2.5;
  const bright = o.bright ?? 0.55;
  const len = Math.floor(seconds * sampleRate);
  const out = new Float32Array(len);
  const P = sampleRate / freq; // 한 주기 샘플 수
  // 고리 지연 = N(버퍼 길이) + 0.5(평균 필터) + d(올패스)
  const N = Math.max(2, Math.floor(P - 0.5 - 0.1));
  const d = P - 0.5 - N;
  const C = (1 - d) / (1 + d);
  const t60 = o.t60 ?? Math.max(0.9, Math.min(4.5, 6.5 - 1.6 * Math.log2(freq / 82)));
  const rho = Math.pow(10, -3 / (t60 * freq));
  const rand = rng(o.seed ?? Math.round(freq * 1000));
  // 처음 잡음: 낮은 통과로 밝기 조절 + 튕기는 위치 빗살 필터
  const init = new Float32Array(N);
  let lp = 0;
  const a = 0.15 + 0.8 * bright;
  for (let i = 0; i < N; i++) { lp += a * (rand() - lp); init[i] = lp; }
  const pp = Math.max(1, Math.round((o.pickPos ?? 0.13) * N));
  const buf = new Float32Array(N);
  for (let i = 0; i < N; i++) buf[i] = init[i] - (i >= pp ? init[i - pp] : 0) * 0.9;
  let mean = 0;
  for (let i = 0; i < N; i++) mean += buf[i];
  mean /= N;
  for (let i = 0; i < N; i++) buf[i] -= mean;
  let idx = 0, prev = 0, apX = 0, apY = 0, peak = 0;
  for (let n = 0; n < len; n++) {
    const cur = buf[idx];
    out[n] = cur;
    const avg = 0.5 * (cur + prev) * rho;
    prev = cur;
    // 올패스: y = C*x + x1 - C*y1
    const y = C * avg + apX - C * apY;
    apX = avg; apY = y;
    buf[idx] = y;
    idx = idx === N - 1 ? 0 : idx + 1;
    const ab = Math.abs(cur);
    if (ab > peak) peak = ab;
  }
  // 처음 5ms 부드럽게, 마지막 50ms 페이드
  const fi = Math.floor(0.002 * sampleRate), fo = Math.floor(0.05 * sampleRate);
  for (let i = 0; i < fi; i++) out[i] *= i / fi;
  for (let i = 0; i < fo; i++) out[len - 1 - i] *= i / fo;
  if (peak > 0) for (let i = 0; i < len; i++) out[i] /= peak;
  return out;
}
