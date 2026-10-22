import { STANDARD } from '../guitar/tunings';
import { chordPcs } from '../guitar/chords';
import { parseChord } from '../guitar/symbols';
import { durToken, type MelNote } from './melody';

/** 편곡 방식 (단계) */
export type FsStyle = 1 | 2 | 3 | 4 | 5 | 6;
export const FS_STYLES: { id: FsStyle; name: string; tip: string; level: 1 | 2 | 3 | 4 }[] = [
  { id: 1, level: 1, name: '1단계 · 강박 베이스 + 멜로디', tip: '엄지는 마디 첫 박(4/4 는 1·3박)에 근음만. 멜로디는 a·m 으로 위 줄에서.' },
  { id: 2, level: 2, name: '2단계 · 박마다 엄지 (핀치)', tip: '엄지가 매 박 근음·교대 베이스, 멜로디가 같은 박이면 함께 집듯이(핀치). 엄지는 일정하게, 멜로디는 조금 더 크게.' },
  { id: 3, level: 2, name: '3단계 · 멜로디 사이 채우기', tip: '멜로디가 길게 끄는 엇박(&)에 i 로 코드 음을 채워 소리가 끊기지 않게. 채우는 음은 멜로디보다 작게.' },
  { id: 4, level: 3, name: '4단계 · 트래비스 + 멜로디', tip: '엄지가 근음–교대 베이스를 쉬지 않고, 멜로디 없는 & 에 m·i 를 번갈아. 엄지가 흔들리면 템포를 낮추세요.' },
  { id: 5, level: 4, name: '5단계 · 퍼커시브 + 멜로디', tip: '1·3박 엄지 베이스, 2·4박은 ✕ 자리에서 손바닥(엄지 아래)으로 줄을 덮으며 몸통을 쳐 스네어 소리. 멜로디는 그 위로 끊기지 않게.' },
  { id: 6, level: 4, name: '6단계 · 퍼커시브 + 하모닉스', tip: '5단계에 하모닉스를 섞어요. <12> 는 12프렛 바로 위 줄을 살짝 대고 튕긴 뒤 바로 떼기 (누르지 않기). 1박 반 넘게 끄는 멜로디 음에 써요.' },
];

export type Voice = 'mel' | 'bass' | 'fill';
export interface FsNote { string: number; fret: number; midi: number; voice: Voice; /** 자연 하모닉스 (fret = 짚는 자리 12·7·5) */ harm?: boolean }
export interface FsEvent { beat: number; notes: FsNote[]; chord?: string; /** 퍼커시브 몸통 치기 */ perc?: boolean }
export interface ChordSpan { beat: number; dur: number; name: string }
/** 멜로디 옥타브: auto 기타에 알맞게, high 한 옥타브 위(하이 포지션), low 한 옥타브 아래 */
export type OctaveMode = 'auto' | 'high' | 'low';
export interface ArrangeOpts { octave?: OctaveMode; tuning?: number[] }
export interface Arrangement { events: FsEvent[]; beats: number; beatsPerBar: number; shift: number; chords: ChordSpan[]; warnings: string[]; tuning: number[]; maxFret: number }

/** 자연 하모닉스: 짚는 프렛 → 개방 줄보다 높아지는 반음 */
export const HARM_SEMIS: Record<number, number> = { 12: 12, 7: 19, 19: 19, 5: 24, 4: 28, 9: 28 };

/** 멜로디를 기타에 맞는 옥타브로 (55~72 안에 가장 많이, 같으면 원래대로) */
export function melodyShift(notes: MelNote[], mode: OctaveMode = 'auto'): number {
  const ms = notes.map((n) => n.midi).filter((m): m is number => m !== null);
  let best = 0, bestN = -Infinity;
  for (const k of [0, -12, 12, -24, 24]) {
    const n = ms.filter((m) => m + k >= 55 && m + k <= 72).length - ms.filter((m) => m + k < 52 || m + k > 79).length * 3;
    if (n > bestN) { bestN = n; best = k; }
  }
  if (mode === 'high') {
    // 한 옥타브 위 (1번 줄 17프렛 = 81 을 넘는 음은 편곡할 때 그 음만 한 옥타브 내림)
    const over = ms.filter((m) => m + best + 12 > 81).length;
    if (over <= ms.length * 0.3) best += 12;
  } else if (mode === 'low') {
    const min = Math.min(...ms) + best - 12;
    if (min >= 52) best -= 12;
  }
  return best;
}

const MAXF = 17;
const r3 = (b: number) => Math.round(b * 1000) / 1000;
const at = (spans: ChordSpan[], beat: number) => spans.find((c) => beat >= c.beat - 1e-6 && beat < c.beat + c.dur - 1e-6) ?? spans[spans.length - 1];

interface Info { root: number; bass: number; pcs: number[] }
function chordInfo(name: string): Info | null {
  const c = parseChord(name);
  if (!c) return null;
  return { root: c.root, bass: c.bass ?? c.root, pcs: chordPcs(c.root, c.suffix) };
}

/** 멜로디 자리를 한꺼번에 (손 이동이 적게): 비터비 */
function placeMelodyAll(ms: number[], tuning: number[], high: boolean): { string: number; fret: number }[] {
  const cands = ms.map((m) => {
    const out: { string: number; fret: number; cost: number }[] = [];
    for (const s of [5, 4, 3, 2]) {
      const f = m - tuning[s];
      if (f < 0 || f > MAXF) continue;
      let c = (f > 12 ? (f - 12) * 0.8 : 0) + (s === 2 ? 4 : 0) + (s === 3 ? 0.6 : 0);
      if (!high) c += f * 0.35 + (f > 5 ? 1.5 : 0);
      out.push({ string: s, fret: f, cost: c });
    }
    return out;
  });
  if (!ms.length) return [];
  const hand = (f: number, prev: number) => (f === 0 ? prev : f);
  // dp[i][k] = 비용, hand
  let prev = cands[0].map((c) => ({ cost: c.cost, hand: hand(c.fret, high ? 7 : 2), from: -1 }));
  const back: { from: number }[][] = [prev.map(() => ({ from: -1 }))];
  for (let i = 1; i < ms.length; i++) {
    const cur = cands[i].map((c) => {
      let best = Infinity, from = 0, h = 0;
      prev.forEach((p, j) => {
        const pc = cands[i - 1][j];
        const nh = hand(c.fret, p.hand);
        const jump = c.fret === 0 ? 0.2 : Math.abs(c.fret - p.hand);
        let t = p.cost + c.cost + jump * 0.6 + (jump > 4 ? 3 : 0) + (Math.abs(c.string - pc.string) > 1 ? 0.5 : 0);
        if (c.string === pc.string && c.fret === pc.fret && ms[i] === ms[i - 1]) t -= 0.3;
        if (t < best) { best = t; from = j; h = nh; }
      });
      return { cost: best, hand: h, from };
    });
    back.push(cur.map((c) => ({ from: c.from })));
    prev = cur;
  }
  let k = prev.reduce((bi, p, i, arr) => (p.cost < arr[bi].cost ? i : bi), 0);
  const out: { string: number; fret: number }[] = new Array(ms.length);
  for (let i = ms.length - 1; i >= 0; i--) {
    out[i] = { string: cands[i][k].string, fret: cands[i][k].fret };
    k = back[i][k].from;
  }
  return out;
}

export function arrange(melody: MelNote[], chords: ChordSpan[], beatsPerBar: number, style: FsStyle, tuningOrOpts: number[] | ArrangeOpts = {}): Arrangement {
  const o: ArrangeOpts = Array.isArray(tuningOrOpts) ? { tuning: tuningOrOpts } : tuningOrOpts;
  const tuning = o.tuning ?? STANDARD.midi;
  const high = o.octave === 'high';
  const warnings: string[] = [];
  const shift = melodyShift(melody, o.octave ?? 'auto');
  const total = Math.max(melody.reduce((t, n) => Math.max(t, n.beat + n.dur), 0), chords.reduce((t, c) => Math.max(t, c.beat + c.dur), 0));
  const beats = Math.ceil(total / beatsPerBar - 1e-6) * beatsPerBar;
  const infos = new Map<string, Info | null>();
  const infoOf = (n: string) => { if (!infos.has(n)) infos.set(n, chordInfo(n)); return infos.get(n)!; };
  for (const c of chords) if (!infoOf(c.name)) warnings.push(`코드 이름을 모름: ${c.name}`);
  const ev = new Map<number, FsEvent>();
  const get = (b: number) => { const k = r3(b); if (!ev.has(k)) ev.set(k, { beat: k, notes: [] }); return ev.get(k)!; };

  // 1) 멜로디 (비터비로 자리)
  // 너무 높은 음은 그 음만 한 옥타브 내림
  let folded = 0;
  const mel = melody.filter((n) => n.midi !== null).map((n) => {
    let m = n.midi! + shift;
    while (m > 81) { m -= 12; folded++; }
    return { ...n, midi: m - shift };
  });
  if (folded) warnings.push(`너무 높은 ${folded}음은 한 옥타브 내려 쳐요`);
  const pos = placeMelodyAll(mel.map((n) => n.midi! + shift), tuning, high);
  const handAt = new Map<number, number>(); // 박 → 손 위치 (멜로디 프렛)
  let hand = high ? 7 : 2;
  mel.forEach((n, i) => {
    const p = pos[i];
    if (!p) { warnings.push(`칠 수 없는 멜로디 음 (${n.beat + 1}박)`); return; }
    if (p.fret > 0) hand = p.fret;
    let note: FsNote = { ...p, midi: n.midi! + shift, voice: 'mel' };
    // 6단계: 1박 넘게 끄는 음은 자연 하모닉스가 있으면
    if (style === 6 && n.dur >= 1.5) {
      for (const s of [5, 4, 3]) {
        const hf = Object.entries(HARM_SEMIS).find(([, semis]) => tuning[s] + semis === note.midi)?.[0];
        if (hf && Number(hf) <= 12) { note = { string: s, fret: Number(hf), midi: note.midi, voice: 'mel', harm: true }; break; }
      }
    }
    get(n.beat).notes.push(note);
    handAt.set(r3(n.beat), hand);
  });
  const handBefore = (b: number) => { let h = high ? 7 : 2; for (const [k, v] of handAt) if (k <= b + 1e-6) h = v; return h; };
  const melNoteAt = (b: number) => [...mel].reverse().find((x) => x.beat <= b + 1e-6 && b < x.beat + x.dur - 1e-6);
  const melStarts = (b: number) => mel.some((n) => Math.abs(n.beat - b) < 1e-6);
  const melTop = (b: number) => { const e = ev.get(r3(b)); const m = e?.notes.find((x) => x.voice === 'mel'); if (m) return { midi: m.midi, string: m.string }; const n = melNoteAt(b); if (!n) return { midi: 999, string: 6 }; const st = ev.get(r3(n.beat))?.notes.find((x) => x.voice === 'mel'); return { midi: n.midi! + shift, string: st?.string ?? 6 }; };

  /** 손 위치 h 에서 이 음이름을 낼 자리 (개방 우선, 낮은 음 우선) */
  const pick = (pcWant: number, strings: number[], h: number, below: number, used: Set<number>, preferLow = true) => {
    let best: { string: number; fret: number; midi: number } | null = null, bestC = Infinity;
    const lo = Math.max(1, h - 4), hi = Math.min(MAXF, Math.max(h + 1, lo + 4));
    for (const s of strings) {
      if (used.has(s)) continue;
      const frets = [0];
      for (let f = lo; f <= hi; f++) frets.push(f);
      for (const f of frets) {
        const midi = tuning[s] + f;
        if (midi % 12 !== pcWant || midi >= below - 2) continue;
        // 베이스는 낮은 음을 크게 우선 (개방 줄은 조금 더), 채우기는 멜로디 가까이 높은 음
        const c = preferLow ? midi * 0.15 - (f === 0 ? 1 : 0) : -midi * 0.05 - (f === 0 ? 1.5 : 0);
        if (c < bestC) { bestC = c; best = { string: s, fret: f, midi }; }
      }
    }
    return best;
  };

  // 2) 베이스 + 퍼커시브
  const strong = (inBar: number) => (beatsPerBar === 4 ? inBar === 0 || inBar === 2 : beatsPerBar === 6 ? inBar === 0 || inBar === 3 : inBar === 0);
  const addBass = (b: number, alt: boolean) => {
    const span = at(chords, b);
    const info = span ? infoOf(span.name) : null;
    if (!info) return;
    const e = get(b);
    const top = melTop(b);
    const used = new Set(e.notes.map((n) => n.string));
    const bassStrings = [0, 1, 2, 3].filter((s) => s < top.string && (s <= 2 || top.string >= 5));
    const h = handBefore(b);
    let p = null;
    if (alt) p = pick((info.root + 7) % 12, bassStrings, h, top.midi, used) ?? pick(info.pcs[1] ?? info.root, bassStrings, h, top.midi, used);
    p = p ?? pick(info.bass, bassStrings, h, top.midi, used) ?? pick(info.bass, bassStrings, Math.min(h, 5), top.midi, used);
    if (!p) return;
    e.notes.push({ ...p, voice: 'bass' });
  };
  for (let b = 0; b < beats; b++) {
    const span = at(chords, b);
    if (!span || !infoOf(span.name)) continue;
    const inBar = b % beatsPerBar;
    const chordStart = Math.abs(span.beat - b) < 1e-6;
    if (style >= 5) {
      if (strong(inBar) || chordStart) addBass(b, false);
      else get(b).perc = true;
      continue;
    }
    if (style === 1 && !strong(inBar) && !chordStart) continue;
    const useAlt = style >= 2 && !chordStart && (beatsPerBar === 3 ? inBar !== 0 : inBar % 2 === 1);
    addBass(b, useAlt);
  }
  for (const c of chords) { const e = get(c.beat); if (!e.chord) e.chord = c.name; }

  // 3) 채우기: 3단계 = 멜로디가 1박 넘게 끄는 &, 4단계 이상 = 멜로디 없는 & 마다
  if (style >= 3) {
    for (let b = 0.5; b < beats; b += 1) {
      if (melStarts(b)) continue;
      const held = melNoteAt(b);
      if (style === 3 && held && b - held.beat < 1) continue;
      const span = at(chords, b);
      const info = span ? infoOf(span.name) : null;
      if (!info) continue;
      const top = melTop(b);
      const strings = [4, 3, 2].filter((s) => s < top.string && s > 0);
      if (style >= 4 && Math.floor(b) % 2 === 1) strings.reverse();
      // 3도 먼저, 없으면 다른 코드 음
      const order = [info.pcs[1], info.pcs[2], info.pcs[0], info.pcs[3]].filter((x) => x !== undefined) as number[];
      const e = get(b);
      const used = new Set(e.notes.map((n) => n.string));
      for (const pc of order) {
        const p = pick(pc, strings, handBefore(b), top.midi, used, false);
        if (p) { e.notes.push({ ...p, voice: 'fill' }); break; }
      }
    }
  }

  // 4) 빈 사건 빼고, 탭으로 못 적는 간격은 박에 베이스를 더해 나눔
  const list = () => [...ev.values()].filter((e) => e.notes.length || e.perc).sort((a, b) => a.beat - b.beat);
  let events = list();
  for (let guard = 0; guard < 6; guard++) {
    let changed = false;
    for (let i = 0; i < events.length; i++) {
      const end = i + 1 < events.length ? events[i + 1].beat : beats;
      if (durToken(end - events[i].beat)) continue;
      const nb = Math.floor(events[i].beat + 1e-6) + 1;
      if (nb >= end - 1e-6) continue;
      if (style >= 5) get(nb).perc = true; else addBass(nb, false);
      changed = true;
    }
    events = list();
    if (!changed) break;
  }
  // 마디 첫 박이 비면 (쉼표로 시작하는 곡) 베이스
  for (let b = 0; b < beats; b += beatsPerBar) if (!ev.get(r3(b))?.notes.length) { addBass(b, false); }
  events = list();
  const maxFret = Math.max(0, ...events.flatMap((e) => e.notes.map((n) => n.fret)));
  return { events, beats, beatsPerBar, shift, chords, warnings, tuning, maxFret };
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
