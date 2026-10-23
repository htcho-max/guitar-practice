/**
 * 어쿠스틱 기타 몸통 울림: 몸통 공기(≈100Hz)·앞판·뒤판 모드를 감쇠 사인파로 더한 짧은 임펄스 응답 (좌우 조금 다르게).
 * 컨볼버에 넣어 합성 줄 소리를 나무 몸통에 울린 소리로.
 */
const MODES: [number, number, number][] = [
  // 주파수 Hz, 감쇠 시간(초), 크기
  [102, 0.09, 1.0], [198, 0.06, 0.8], [228, 0.05, 0.55], [285, 0.04, 0.35], [390, 0.035, 0.45],
  [470, 0.03, 0.35], [560, 0.025, 0.3], [690, 0.02, 0.22], [820, 0.018, 0.2], [1050, 0.012, 0.15],
  [1400, 0.01, 0.1], [2100, 0.006, 0.06],
];

export function bodyImpulse(ctx: BaseAudioContext): AudioBuffer {
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * 0.35);
  const buf = ctx.createBuffer(2, len, sr);
  let seed = 12345;
  const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
  for (let ch = 0; ch < 2; ch++) {
    const d = buf.getChannelData(ch);
    d[0] = 1;
    for (const [f0, tau, amp] of MODES) {
      const f = f0 * (1 + (ch ? 0.012 : -0.012) * (rnd() - 0.3));
      const ph = rnd() * Math.PI * 2;
      const w = (2 * Math.PI * f) / sr;
      for (let i = 0; i < len; i++) {
        const e = Math.exp(-i / (tau * sr));
        if (e < 1e-4) break;
        d[i] += amp * 0.06 * e * Math.sin(w * i + ph);
      }
    }
    // 나무의 짧은 잔향 (처음 30ms 잡음)
    const n = Math.floor(sr * 0.03);
    let lp = 0;
    for (let i = 1; i < n; i++) { lp += 0.25 * (rnd() * 2 - 1 - lp); d[i] += lp * 0.08 * Math.exp(-i / (sr * 0.008)); }
  }
  return buf;
}
