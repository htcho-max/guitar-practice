// 스모크용 가짜 마이크 소리 (npx vite-node scripts/make-test-wav.ts)
import { writeFileSync } from 'node:fs';
import { ksSamples } from '../src/audio/pluck';
import { midiToFreq } from '../src/audio/notes';

const SR = 48000;
function wav(name: string, sig: Float32Array) {
  const n = sig.length, buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8); buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) buf.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(sig[i] * 32767))), 44 + i * 2);
  writeFileSync(new URL(name, import.meta.url), buf);
}
function mix(len: number, notes: { midi: number; at: number; vel?: number }[]) {
  const out = new Float32Array(Math.floor(len * SR));
  notes.forEach((nt, k) => {
    const s = ksSamples(midiToFreq(nt.midi), SR, { seconds: 2.2, seed: k + 11 });
    const o = Math.floor(nt.at * SR);
    for (let i = 0; i < s.length && o + i < out.length; i++) out[o + i] += s[i] * (nt.vel ?? 0.35);
  });
  return out;
}
// 5번 줄 A2 를 1.5초마다
wav('test-a2.wav', mix(6, [0.2, 1.7, 3.2, 4.7].map((at) => ({ midi: 45, at, vel: 0.6 }))));
// C 코드 (x32010) 를 1.2초마다 긁기
const C = [48, 52, 55, 60, 64];
wav('test-c-chord.wav', mix(6, [0.2, 1.4, 2.6, 3.8, 5.0].flatMap((at) => C.map((midi, k) => ({ midi, at: at + k * 0.015 })))));
console.log('wav ok');
