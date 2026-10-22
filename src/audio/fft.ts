/** 실수 신호 FFT (길이 2의 거듭제곱). 크기 스펙트럼 |X[k]| (k = 0..n/2) 를 돌려줌. 시험·오프라인 분석용 (실시간은 AnalyserNode) */
export function magnitudes(signal: Float32Array, window = true): Float32Array {
  const n = signal.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) re[i] = signal[i] * (window ? 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1)) : 1);
  // 비트 뒤집기
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const ar = re[i + k], ai = im[i + k];
        const br = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci;
        const bi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ar + br; im[i + k] = ai + bi;
        re[i + k + len / 2] = ar - br; im[i + k + len / 2] = ai - bi;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  const out = new Float32Array(n / 2 + 1);
  for (let k = 0; k <= n / 2; k++) out[k] = Math.hypot(re[k], im[k]) / n;
  return out;
}

/** AnalyserNode 의 dB 값 → 크기 */
export function dbToMag(db: Float32Array, out = new Float32Array(db.length)): Float32Array {
  for (let i = 0; i < db.length; i++) out[i] = Number.isFinite(db[i]) ? Math.pow(10, db[i] / 20) : 0;
  return out;
}
