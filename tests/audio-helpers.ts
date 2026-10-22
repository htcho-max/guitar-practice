import { ksSamples } from '../src/audio/pluck';
import { midiToFreq } from '../src/audio/notes';

export const SR = 48000;
/** 음들을 시각(초)에 더해 넣은 신호 */
export function render(notes: { midi: number; at: number; vel?: number }[], seconds: number, noise = 0): Float32Array {
  const out = new Float32Array(Math.floor(seconds * SR));
  let seed = 7;
  for (const n of notes) {
    const s = ksSamples(midiToFreq(n.midi), SR, { seconds: Math.min(2.5, seconds - n.at), seed: seed++ });
    const o = Math.floor(n.at * SR);
    for (let i = 0; i < s.length && o + i < out.length; i++) out[o + i] += s[i] * (n.vel ?? 0.6);
  }
  if (noise) { let x = 1; for (let i = 0; i < out.length; i++) { x = (x * 16807) % 2147483647; out[i] += noise * ((x / 2147483647) * 2 - 1); } }
  return out;
}
export function strum(midis: (number | null)[], at = 0, spread = 0.015) {
  return midis.filter((m): m is number => m !== null).map((midi, k) => ({ midi, at: at + k * spread }));
}
