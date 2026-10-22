import { noteClick } from './clicks';

/** 클릭 대신: 드럼 / 드럼 + 베이스 */
export type Backing = 'click' | 'drums' | 'bass';
let noise: AudioBuffer | null = null;
let bus: { ctx: AudioContext; g: GainNode } | null = null;

function out(ctx: AudioContext, vol: number): GainNode {
  if (!bus || bus.ctx !== ctx) { const g = ctx.createGain(); g.connect(ctx.destination); bus = { ctx, g }; }
  bus.g.gain.value = vol;
  return bus.g;
}
function noiseBuf(ctx: AudioContext) {
  if (!noise || noise.sampleRate !== ctx.sampleRate) {
    const len = Math.floor(ctx.sampleRate * 0.25);
    noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }
  return noise;
}

export function kick(ctx: AudioContext, t: number, vel: number, dest: AudioNode) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(130, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(vel * 1.4, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
  o.connect(g).connect(dest);
  o.start(t); o.stop(t + 0.32);
}
export function snare(ctx: AudioContext, t: number, vel: number, dest: AudioNode) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 1400;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel * 0.8, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  s.connect(f).connect(g).connect(dest);
  s.start(t); s.stop(t + 0.18);
  const o = ctx.createOscillator();
  const og = ctx.createGain();
  o.frequency.value = 190;
  og.gain.setValueAtTime(vel * 0.5, t);
  og.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  o.connect(og).connect(dest);
  o.start(t); o.stop(t + 0.1);
}
export function hat(ctx: AudioContext, t: number, vel: number, dest: AudioNode) {
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf(ctx);
  const f = ctx.createBiquadFilter();
  f.type = 'highpass'; f.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel * 0.35, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
  s.connect(f).connect(g).connect(dest);
  s.start(t); s.stop(t + 0.06);
}
/** 베이스 한 음 (E2~D#3 사이로) */
export function bassNote(ctx: AudioContext, t: number, pc: number, dur: number, vel: number, dest: AudioNode) {
  const midi = 40 + ((pc - 4 + 12) % 12);
  const o = ctx.createOscillator();
  o.type = 'triangle';
  o.frequency.value = 440 * 2 ** ((midi - 69) / 12);
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass'; f.frequency.value = 700;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vel * 0.9, t + 0.01);
  g.gain.exponentialRampToValueAtTime(vel * 0.4, t + 0.2);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(f).connect(g).connect(dest);
  o.start(t); o.stop(t + dur + 0.02);
}

/** 박 하나의 드럼 (pos = 마디 안 박), 8분 하이햇 포함 */
export function drumBeat(ctx: AudioContext, t: number, pos: number, meter: number, spb: number, volume: number, bassPc?: number | null) {
  const dest = out(ctx, volume);
  const kickAt = pos === 0 || (meter === 4 && pos === 2) || (meter === 6 && pos === 3 && false);
  const snareAt = meter === 4 ? pos === 1 || pos === 3 : meter === 3 ? pos !== 0 : meter === 6 ? pos === 3 : meter === 2 ? pos === 1 : pos === meter - 1;
  if (kickAt) kick(ctx, t, 0.9, dest);
  if (snareAt) snare(ctx, t, meter === 3 ? 0.45 : 0.8, dest);
  hat(ctx, t, pos === 0 ? 0.8 : 0.6, dest);
  if (meter !== 3 && meter !== 6) hat(ctx, t + spb / 2, 0.35, dest);
  noteClick(t);
  if (bassPc !== null && bassPc !== undefined && (pos === 0 || (meter === 4 && pos === 2) || (meter === 6 && pos === 3))) {
    bassNote(ctx, t, bassPc, spb * (meter === 3 ? 2.7 : 1.8), 0.8, dest);
  }
}
