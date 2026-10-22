import type { Arrangement } from './arrange';
import { renderTabRows, type TEvent } from '../song/tabtext';
import { TUNINGS } from '../guitar/tunings';

const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** 편곡 → ChordPro 곡 글 (탭 + 리듬 줄, 줄마다 barsPerLine 마디, 위에 코드 주석) */
export function toSongText(arr: Arrangement, o: { title: string; artist?: string; tempo?: number; barsPerLine?: number; note?: string }): string {
  const bpl = o.barsPerLine ?? 2;
  const bars = arr.beats / arr.beatsPerBar;
  const out: string[] = [`{title: ${o.title}}`];
  if (o.artist) out.push(`{artist: ${o.artist}}`);
  out.push(`{time: ${arr.beatsPerBar}/4}`);
  if (o.tempo) out.push(`{tempo: ${o.tempo}}`);
  const std = arr.tuning.join() === '40,45,50,55,59,64';
  const tid = TUNINGS.find((t) => t.midi.join() === arr.tuning.join())?.id;
  if (!std && tid) out.push(`{tuning: ${tid}}`);
  if (!std) out.push(`{c: 조율 ${arr.tuning.map((m) => NOTE_NAMES[m % 12]).join(' ')} (6번 줄부터)}`);
  if (o.note) out.push(`{c: ${o.note}}`);
  const hasHarm = arr.events.some((e) => e.notes.some((n) => n.harm));
  const hasPerc = arr.events.some((e) => e.perc && !e.slap);
  const hasSlap = arr.events.some((e) => e.slap);
  const hasArt = arr.events.some((e) => e.notes.some((n) => n.art));
  if (hasHarm || hasPerc || hasSlap || hasArt) out.push(`{c: ${[hasHarm ? '<12> = 자연 하모닉스 (줄 위에 살짝 대고 튕기기)' : '', hasArt ? '[f] = 인공 하모닉스 (f 를 누르고 f+12 위를 오른손으로 대고 튕기기)' : '', hasPerc ? 'x = 몸통 치기(퍼커시브)' : '', hasSlap ? 'S = 엄지 슬랩' : ''].filter(Boolean).join(' · ')}}`);
  const tev: TEvent[] = arr.events.map((e) => ({ beat: e.beat, perc: e.perc && !e.slap, notes: [...e.notes.map((n) => ({ string: n.string, fret: n.fret, harm: n.harm, art: n.art, tap: n.tap, slap: n.slap, dead: n.slap })), ...(e.slap ? [0, 1].filter((s) => !e.notes.some((n) => n.string === s)).map((s) => ({ string: s, fret: 0, slap: true, dead: true })) : [])] }));
  for (let b0 = 0; b0 < bars; b0 += bpl) {
    const from = b0 * arr.beatsPerBar, to = Math.min(bars, b0 + bpl) * arr.beatsPerBar;
    const barLabels: string[] = [];
    for (let m = b0; m < Math.min(bars, b0 + bpl); m++) {
      const ms = m * arr.beatsPerBar, me = ms + arr.beatsPerBar;
      barLabels.push(arr.chords.filter((c) => c.beat >= ms - 1e-6 && c.beat < me - 1e-6).map((c) => c.name).join(' ') || '·');
    }
    out.push('', `{c: ${barLabels.join(' | ')}}`, ...renderTabRows(tev, from, to, arr.beatsPerBar));
  }
  return out.join('\n');
}
