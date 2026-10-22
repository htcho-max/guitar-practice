import { STANDARD } from '../guitar/tunings';
import { rootString, type ChordShape } from '../guitar/chords';
import { parseChord, shapeForSymbol } from '../guitar/symbols';
import { roleString } from '../finger/patterns';
import { durToken, type MelNote } from './melody';

/** 편곡 방식 (단계) */
export type FsStyle = 1 | 2 | 3 | 4;
export const FS_STYLES: { id: FsStyle; name: string; tip: string }[] = [
  { id: 1, name: '1단계 · 강박 베이스 + 멜로디', tip: '엄지는 마디 첫 박(4/4 는 1·3박)에 근음만. 멜로디는 a·m 으로 위 줄에서. 멜로디가 끊기지 않게 엄지와 겹치는 박을 고르게.' },
  { id: 2, name: '2단계 · 박마다 엄지 (핀치)', tip: '엄지가 매 박 근음·교대 베이스를 치고, 멜로디가 같은 박에 오면 엄지와 함께 집듯이(핀치). 엄지는 일정하게, 멜로디는 조금 더 크게.' },
  { id: 3, name: '3단계 · 멜로디 사이 채우기', tip: '멜로디가 쉬는 엇박(&)에 i 로 코드 음을 채워 소리가 끊기지 않게. 채우는 음은 멜로디보다 작게.' },
  { id: 4, name: '4단계 · 트래비스 + 멜로디', tip: '엄지가 근음–교대 베이스를 쉬지 않고, 멜로디 없는 &에 m·i 를 번갈아. 엄지가 흔들리면 템포를 낮추세요.' },
];

export type Voice = 'mel' | 'bass' | 'fill';
export interface FsNote { string: number; fret: number; midi: number; voice: Voice }
export interface FsEvent { beat: number; notes: FsNote[]; chord?: string }
export interface ChordSpan { beat: number; dur: number; name: string }
export interface Arrangement { events: FsEvent[]; beats: number; beatsPerBar: number; shift: number; chords: ChordSpan[]; warnings: string[] }

/** 멜로디를 기타에 맞는 옥타브로 (55~72 안에 가장 많이, 같으면 원래대로) */
export function melodyShift(notes: MelNote[]): number {
  const ms = notes.map((n) => n.midi).filter((m): m is number => m !== null);
  let best = 0, bestN = -1;
  for (const k of [0, -12, 12, -24]) {
    const n = ms.filter((m) => m + k >= 55 && m + k <= 72).length - ms.filter((m) => m + k < 52 || m + k > 79).length * 3;
    if (n > bestN) { bestN = n; best = k; }
  }
  return best;
}

const at = (spans: ChordSpan[], beat: number) => spans.find((c) => beat >= c.beat - 1e-6 && beat < c.beat + c.dur - 1e-6) ?? spans[spans.length - 1];

/** 멜로디 음 자리: 위 세 줄(필요하면 4번 줄), 낮은 프렛·코드 모양 안·손 위치 가까이 */
function placeMelody(midi: number, shape: ChordShape | null, hand: number, tuning: number[], avoid: Set<number>): { string: number; fret: number } | null {
  let best: { string: number; fret: number } | null = null, bestC = Infinity;
  for (const s of [5, 4, 3, 2]) {
    if (avoid.has(s)) continue;
    const f = midi - tuning[s];
    if (f < 0 || f > 15) continue;
    let c = f * 0.6 + Math.abs(f - hand) * 0.8 + (f > 5 ? 2 : 0) + (s === 2 ? 4 : 0);
    if (shape && shape.frets[s] === f) c -= 2.5; // 코드 모양 그대로
    if (shape && shape.frets[s] !== null && shape.frets[s]! > 0 && f === 0) c += 1; // 짚은 줄을 개방으로 쓰면 코드가 끊김
    if (c < bestC) { bestC = c; best = { string: s, fret: f }; }
  }
  return best;
}

export function arrange(melody: MelNote[], chords: ChordSpan[], beatsPerBar: number, style: FsStyle, tuning = STANDARD.midi): Arrangement {
  const warnings: string[] = [];
  const shift = melodyShift(melody);
  const total = Math.max(melody.reduce((t, n) => Math.max(t, n.beat + n.dur), 0), chords.reduce((t, c) => Math.max(t, c.beat + c.dur), 0));
  const beats = Math.ceil(total / beatsPerBar - 1e-6) * beatsPerBar;
  const shapes = new Map<string, ChordShape | null>();
  const shapeOf = (n: string) => { if (!shapes.has(n)) { const c = parseChord(n); shapes.set(n, c ? shapeForSymbol(c) : null); } return shapes.get(n)!; };
  for (const c of chords) if (!shapeOf(c.name)) warnings.push(`코드 모양을 모름: ${c.name}`);
  const ev = new Map<number, FsEvent>();
  const get = (b: number) => { const k = Math.round(b * 1000) / 1000; if (!ev.has(k)) ev.set(k, { beat: k, notes: [] }); return ev.get(k)!; };

  // 1) 멜로디
  let hand = 2;
  const melAt = new Map<number, number>(); // 박 → 멜로디 줄
  for (const n of melody) {
    if (n.midi === null) continue;
    const span = at(chords, n.beat);
    const shape = span ? shapeOf(span.name) : null;
    const pos = placeMelody(n.midi + shift, shape, hand, tuning, new Set());
    if (!pos) { warnings.push(`칠 수 없는 멜로디 음 (${n.beat + 1}박)`); continue; }
    hand = pos.fret || hand;
    get(n.beat).notes.push({ ...pos, midi: n.midi + shift, voice: 'mel' });
    melAt.set(Math.round(n.beat * 1000) / 1000, pos.string);
  }
  // 멜로디가 울리고 있는지 (다음 멜로디 음까지)
  const melStarts = (b: number) => melody.some((n) => n.midi !== null && Math.abs(n.beat - b) < 1e-6);
  const melPitchAt = (b: number) => { const n = [...melody].reverse().find((x) => x.midi !== null && x.beat <= b + 1e-6); return n ? n.midi! + shift : 999; };

  // 2) 베이스
  const strong = (beat: number) => {
    const inBar = beat % beatsPerBar;
    if (beatsPerBar === 4) return inBar === 0 || inBar === 2;
    if (beatsPerBar === 6) return inBar === 0 || inBar === 3;
    return inBar === 0;
  };
  for (let b = 0; b < beats; b++) {
    const span = at(chords, b);
    if (!span) continue;
    const shape = shapeOf(span.name);
    if (!shape) continue;
    const chordStart = Math.abs(span.beat - b) < 1e-6;
    if (style === 1 && !strong(b) && !chordStart) continue;
    const inBar = b % beatsPerBar;
    // 근음: 강박·코드 바뀌는 박, 교대 베이스: 나머지 (스타일 2 이상)
    const useAlt = style >= 2 && !chordStart && (beatsPerBar === 3 ? inBar !== 0 : inBar % 2 === 1);
    let s = useAlt ? roleString('p2', shape, tuning) : rootString(shape, tuning);
    const e = get(b);
    if (e.notes.some((n) => n.string === s)) s = rootString(shape, tuning);
    if (e.notes.some((n) => n.string === s)) continue;
    const mel = e.notes.find((n) => n.voice === 'mel');
    const f = shape.frets[s] ?? 0;
    const midi = tuning[s] + f;
    if (mel && midi >= mel.midi) continue; // 베이스가 멜로디보다 높으면 빼기
    e.notes.push({ string: s, fret: f, midi, voice: 'bass' });
    if (chordStart) e.chord = span.name;
  }
  for (const c of chords) { const e = ev.get(Math.round(c.beat * 1000) / 1000); if (e && !e.chord) e.chord = c.name; }

  // 3) 채우기 (스타일 3: 멜로디가 길게 끄는 & 에만, 스타일 4: 멜로디 없는 & 마다 m·i 번갈아)
  if (style >= 3) {
    for (let b = 0.5; b < beats; b += 1) {
      if (melStarts(b)) continue;
      const held = melody.find((n) => n.midi !== null && b > n.beat + 1e-6 && b < n.beat + n.dur - 1e-6);
      if (style === 3 && held && b - held.beat < 1) continue;
      const span = at(chords, b);
      const shape = span ? shapeOf(span.name) : null;
      if (!shape) continue;
      const busy = held ? melAt.get(Math.round(held.beat * 1000) / 1000) : undefined;
      const pref = style === 4 && Math.floor(b) % 2 === 0 ? [4, 3] : [3, 4];
      const top = melPitchAt(b);
      for (const s of pref) {
        const f = shape.frets[s];
        if (f === null || s === busy) continue;
        const midi = tuning[s] + f;
        if (midi >= top) continue;
        get(b).notes.push({ string: s, fret: f, midi, voice: 'fill' });
        break;
      }
    }
  }
  // 빈 사건 빼고 정렬, 탭으로 못 적는 간격은 박에 베이스를 더해 나눔
  let events = [...ev.values()].filter((e) => e.notes.length).sort((a, b) => a.beat - b.beat);
  for (let guard = 0; guard < 4; guard++) {
    let changed = false;
    for (let i = 0; i < events.length; i++) {
      const end = i + 1 < events.length ? events[i + 1].beat : beats;
      const g = end - events[i].beat;
      if (durToken(g)) continue;
      const nb = Math.floor(events[i].beat) + 1;
      if (nb >= end - 1e-6) continue;
      const span = at(chords, nb);
      const shape = span ? shapeOf(span.name) : null;
      if (!shape) continue;
      const s = rootString(shape, tuning);
      get(nb).notes.push({ string: s, fret: shape.frets[s] ?? 0, midi: tuning[s] + (shape.frets[s] ?? 0), voice: 'bass' });
      changed = true;
    }
    events = [...ev.values()].filter((e) => e.notes.length).sort((a, b) => a.beat - b.beat);
    if (!changed) break;
  }
  return { events, beats, beatsPerBar, shift, chords, warnings };
}

/** 코드 글자(마디 줄) → 박 구간 */
export function chordSpans(bars: string, beatsPerBar: number): ChordSpan[] {
  const out: ChordSpan[] = [];
  let t = 0;
  for (const bar of bars.split('|').map((x) => x.trim()).filter(Boolean)) {
    const toks = bar.split(/\s+/);
    const d = beatsPerBar / toks.length;
    for (const tok of toks) {
      if ((tok === '.' || tok === '%') && out.length) out[out.length - 1].dur += d;
      else out.push({ beat: t, dur: d, name: tok });
      t += d;
    }
  }
  return out;
}
