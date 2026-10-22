import { CHORD_TYPES, shapesFor, type ChordShape } from './chords';
import { findVoicings } from './voicings';
import { STANDARD } from './tunings';

const isStd = (t?: number[]) => !t || t.every((m, i) => m === STANDARD.midi[i]);
/** 조율에 맞는 모양들 (표준이면 정해 둔 모양, 아니면 찾아서) */
export function shapesForTuning(root: number, suffix: string, bass: number | undefined, tuning?: number[]): ChordShape[] {
  if (isStd(tuning)) return shapesFor(root, suffix, bass);
  let v = findVoicings(root, suffix, tuning!, bass);
  if (!v.length && bass !== undefined) v = findVoicings(root, suffix, tuning!);
  return v;
}

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const COMMON = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

export interface ChordSymbol {
  root: number;
  /** 원래 적힌 종류 글자 (m7, sus, 13 …) */
  quality: string;
  /** 앱이 아는 종류로 맞춘 것 (모양·소리용) */
  suffix: string;
  bass?: number;
  /** 원래 근음 표기가 b 이었는지 */
  flat: boolean;
}

// 적힌 종류 → 앱 종류 (모르는 확장은 가까운 것으로)
const ALIAS: [RegExp, string][] = [
  [/^(M|maj|major)?$/, ''],
  [/^(m|min|mi|-)$/, 'm'],
  [/^(7|dom7)$/, '7'],
  [/^(m7|min7|mi7|-7)$/, 'm7'],
  [/^(maj7|M7|Maj7|ma7|△7?|Δ7?|j7)$/, 'maj7'],
  [/^(sus2|2)$/, 'sus2'],
  [/^(sus4?|4)$/, 'sus4'],
  [/^(7sus4?|sus7|7sus)$/, '7sus4'],
  [/^(add9|add2|\(add9\)|\(9\))$/, 'add9'],
  [/^(6|M6|maj6)$/, '6'],
  [/^(9|7\(9\)|add7\(9\))$/, '9'],
  [/^(m7b5|m7-5|m7\(b5\)|ø7?|-7b5)$/, 'm7b5'],
  [/^(dim|°|o|-5|\(b5\))$/, 'dim'],
  [/^(dim7|°7|o7)$/, 'dim7'],
  [/^(aug|\+|#5|\+5|\(#5\))$/, 'aug'],
  // 가까운 것으로
  [/^(m9|m11|m13|-9|min9)$/, 'm7'],
  [/^(maj9|M9|maj13|maj7#11|M7\(9\))$/, 'maj7'],
  [/^(11|13|7b9|7#9|7#11|7b13|7alt|9sus4?)$/, '7'],
  [/^(m6|-6|m69|madd9|m\(add9\))$/, 'm'],
  [/^(6\/9|69)$/, '6'],
  [/^(5|add11|\(add11\)|omit3)$/, ''],
  [/^(mmaj7|mM7|m\(maj7\))$/, 'm'],
];

const RE = /^([A-Ga-g])([#b♯♭]?)([^/\s]*)(?:\/([A-Ga-g])([#b♯♭]?))?$/;

export function parseChord(text: string): ChordSymbol | null {
  const m = RE.exec(text.trim());
  if (!m) return null;
  const acc = (a: string) => (a === '#' || a === '♯' ? 1 : a === 'b' || a === '♭' ? -1 : 0);
  const root = (LETTER[m[1].toUpperCase()] + acc(m[2]) + 12) % 12;
  const quality = m[3];
  let suffix: string | null = null;
  for (const [re, s] of ALIAS) if (re.test(quality)) { suffix = s; break; }
  if (suffix === null) {
    // 앞부분이라도 맞추기 (예: m7b9 → m7)
    const known = CHORD_TYPES.map((t) => t.suffix).filter(Boolean).sort((a, b) => b.length - a.length);
    const hit = known.find((k) => quality.startsWith(k));
    if (hit) suffix = hit;
    else if (/^m(?!aj)/.test(quality)) suffix = 'm';
    else return null;
  }
  const bass = m[4] ? (LETTER[m[4].toUpperCase()] + acc(m[5]) + 12) % 12 : undefined;
  return { root, quality, suffix, bass: bass === root ? undefined : bass, flat: m[2] === 'b' || m[2] === '♭' };
}

export const isChordToken = (t: string) => parseChord(t) !== null;

/** 반음 이동한 코드 이름. useFlats 가 없으면 흔한 표기 */
export function transposeName(text: string, semis: number, useFlats?: boolean): string {
  const c = parseChord(text);
  if (!c) return text;
  const names = useFlats === undefined ? COMMON : useFlats ? FLAT : SHARP;
  const r = (c.root + semis + 120) % 12;
  const b = c.bass === undefined ? '' : '/' + names[(c.bass + semis + 120) % 12];
  return names[r] + c.quality + b;
}

/** 곡의 코드 이름에 맞는 모양 (분수 코드가 없으면 베이스 없는 모양) */
export function shapeForSymbol(c: ChordSymbol, prefer = 0, tuning?: number[]): ChordShape | null {
  if (!isStd(tuning)) {
    let v = shapesForTuning(c.root, c.suffix, c.bass, tuning);
    if (!v.length) v = shapesForTuning(c.root, c.suffix.startsWith('m') && c.suffix !== 'maj7' ? 'm' : '', undefined, tuning);
    return v[Math.min(prefer, v.length - 1)] ?? null;
  }
  let list = shapesFor(c.root, c.suffix, c.bass);
  if (!list.length) list = shapesFor(c.root, c.suffix);
  if (!list.length) list = shapesFor(c.root, c.suffix.startsWith('m') && c.suffix !== 'maj7' ? 'm' : '');
  return list[Math.min(prefer, list.length - 1)] ?? null;
}

/** 카포를 끼면: 소리 나는 코드 → 잡는 모양의 이름 */
export function shapeNameWithCapo(text: string, capo: number): string {
  return capo ? transposeName(text, -capo) : text;
}
