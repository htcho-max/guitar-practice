import { PC_NAMES } from '../audio/notes';
import { STANDARD } from './tunings';

/** 코드 종류: 이름 뒤에 붙는 글자 + 근음에서의 반음 거리 + 표시용 도수 */
export interface ChordType { suffix: string; name: string; iv: number[]; degrees: string[] }
export const CHORD_TYPES: ChordType[] = [
  { suffix: '', name: '메이저', iv: [0, 4, 7], degrees: ['R', '3', '5'] },
  { suffix: 'm', name: '마이너', iv: [0, 3, 7], degrees: ['R', 'b3', '5'] },
  { suffix: '7', name: '세븐', iv: [0, 4, 7, 10], degrees: ['R', '3', '5', 'b7'] },
  { suffix: 'm7', name: '마이너 세븐', iv: [0, 3, 7, 10], degrees: ['R', 'b3', '5', 'b7'] },
  { suffix: 'maj7', name: '메이저 세븐', iv: [0, 4, 7, 11], degrees: ['R', '3', '5', '7'] },
  { suffix: 'sus2', name: '서스 2', iv: [0, 2, 7], degrees: ['R', '2', '5'] },
  { suffix: 'sus4', name: '서스 4', iv: [0, 5, 7], degrees: ['R', '4', '5'] },
  { suffix: '7sus4', name: '세븐 서스 4', iv: [0, 5, 7, 10], degrees: ['R', '4', '5', 'b7'] },
  { suffix: 'add9', name: '애드 나인', iv: [0, 2, 4, 7], degrees: ['R', '9', '3', '5'] },
  { suffix: '6', name: '식스', iv: [0, 4, 7, 9], degrees: ['R', '3', '5', '6'] },
  { suffix: '9', name: '나인', iv: [0, 2, 4, 7, 10], degrees: ['R', '9', '3', '5', 'b7'] },
  { suffix: 'm7b5', name: '하프 디미니시', iv: [0, 3, 6, 10], degrees: ['R', 'b3', 'b5', 'b7'] },
  { suffix: 'dim', name: '디미니시', iv: [0, 3, 6], degrees: ['R', 'b3', 'b5'] },
  { suffix: 'dim7', name: '디미니시 세븐', iv: [0, 3, 6, 9], degrees: ['R', 'b3', 'b5', 'bb7'] },
  { suffix: 'aug', name: '오그먼트', iv: [0, 4, 8], degrees: ['R', '3', '#5'] },
];
export const typeBySuffix = (s: string) => CHORD_TYPES.find((t) => t.suffix === s);

export type Finger = 0 | 1 | 2 | 3 | 4 | 'T';
/** 코드 모양. frets/fingers 는 6번 줄부터 1번 줄까지 (null = 안 치는 줄) */
export interface ChordShape {
  id: string;
  root: number;
  suffix: string;
  /** 분수 코드의 베이스 음 */
  bass?: number;
  frets: (number | null)[];
  fingers: Finger[];
  barre?: { fret: number; from: number; to: number };
  /** 1 입문, 2 초급, 3 중급 */
  level: 1 | 2 | 3;
  form: 'open' | 'E' | 'A';
}

export function chordName(root: number, suffix: string, bass?: number): string {
  return PC_NAMES[root] + suffix + (bass !== undefined ? '/' + PC_NAMES[bass] : '');
}
export const shapeName = (s: ChordShape) => chordName(s.root, s.suffix, s.bass);
export function chordPcs(root: number, suffix: string): number[] {
  const t = typeBySuffix(suffix) ?? CHORD_TYPES[0];
  return t.iv.map((i) => (root + i) % 12);
}

const X = null;
type Row = [string, number, string, (number | null)[], Finger[], 1 | 2 | 3, number?];
// [이름표시용 근음, 근음 pc, suffix, 프렛, 손가락, 단계, 베이스 pc]
const OPEN: Row[] = [
  ['C', 0, '', [X, 3, 2, 0, 1, 0], [0, 3, 2, 0, 1, 0], 1],
  ['G', 7, '', [3, 2, 0, 0, 0, 3], [2, 1, 0, 0, 0, 3], 1],
  ['D', 2, '', [X, X, 0, 2, 3, 2], [0, 0, 0, 1, 3, 2], 1],
  ['E', 4, '', [0, 2, 2, 1, 0, 0], [0, 2, 3, 1, 0, 0], 1],
  ['A', 9, '', [X, 0, 2, 2, 2, 0], [0, 0, 1, 2, 3, 0], 1],
  ['Am', 9, 'm', [X, 0, 2, 2, 1, 0], [0, 0, 2, 3, 1, 0], 1],
  ['Em', 4, 'm', [0, 2, 2, 0, 0, 0], [0, 2, 3, 0, 0, 0], 1],
  ['Dm', 2, 'm', [X, X, 0, 2, 3, 1], [0, 0, 0, 2, 3, 1], 1],
  ['F', 5, '', [X, X, 3, 2, 1, 1], [0, 0, 3, 2, 1, 1], 2],
  ['A7', 9, '7', [X, 0, 2, 0, 2, 0], [0, 0, 2, 0, 3, 0], 2],
  ['B7', 11, '7', [X, 2, 1, 2, 0, 2], [0, 2, 1, 3, 0, 4], 2],
  ['C7', 0, '7', [X, 3, 2, 3, 1, 0], [0, 3, 2, 4, 1, 0], 2],
  ['D7', 2, '7', [X, X, 0, 2, 1, 2], [0, 0, 0, 2, 1, 3], 2],
  ['E7', 4, '7', [0, 2, 0, 1, 0, 0], [0, 2, 0, 1, 0, 0], 2],
  ['G7', 7, '7', [3, 2, 0, 0, 0, 1], [3, 2, 0, 0, 0, 1], 2],
  ['Am7', 9, 'm7', [X, 0, 2, 0, 1, 0], [0, 0, 2, 0, 1, 0], 2],
  ['Em7', 4, 'm7', [0, 2, 0, 0, 0, 0], [0, 2, 0, 0, 0, 0], 2],
  ['Dm7', 2, 'm7', [X, X, 0, 2, 1, 1], [0, 0, 0, 2, 1, 1], 2],
  ['Cmaj7', 0, 'maj7', [X, 3, 2, 0, 0, 0], [0, 3, 2, 0, 0, 0], 2],
  ['Fmaj7', 5, 'maj7', [X, X, 3, 2, 1, 0], [0, 0, 3, 2, 1, 0], 2],
  ['Gmaj7', 7, 'maj7', [3, 2, 0, 0, 0, 2], [3, 2, 0, 0, 0, 1], 2],
  ['Amaj7', 9, 'maj7', [X, 0, 2, 1, 2, 0], [0, 0, 2, 1, 3, 0], 2],
  ['Dmaj7', 2, 'maj7', [X, X, 0, 2, 2, 2], [0, 0, 0, 1, 1, 1], 2],
  ['Emaj7', 4, 'maj7', [0, 2, 1, 1, 0, 0], [0, 3, 1, 2, 0, 0], 2],
  ['Dsus2', 2, 'sus2', [X, X, 0, 2, 3, 0], [0, 0, 0, 1, 3, 0], 2],
  ['Dsus4', 2, 'sus4', [X, X, 0, 2, 3, 3], [0, 0, 0, 1, 3, 4], 2],
  ['Asus2', 9, 'sus2', [X, 0, 2, 2, 0, 0], [0, 0, 1, 2, 0, 0], 2],
  ['Asus4', 9, 'sus4', [X, 0, 2, 2, 3, 0], [0, 0, 1, 2, 3, 0], 2],
  ['Esus4', 4, 'sus4', [0, 2, 2, 2, 0, 0], [0, 2, 3, 4, 0, 0], 2],
  ['Cadd9', 0, 'add9', [X, 3, 2, 0, 3, 3], [0, 2, 1, 0, 3, 4], 2],
  ['Aadd9', 9, 'add9', [X, 0, 2, 4, 2, 0], [0, 0, 1, 4, 2, 0], 3],
  ['Eadd9', 4, 'add9', [0, 2, 4, 1, 0, 0], [0, 2, 4, 1, 0, 0], 3],
  ['A6', 9, '6', [X, 0, 2, 2, 2, 2], [0, 0, 1, 1, 1, 1], 3],
  ['G/B', 7, '', [X, 2, 0, 0, 0, 3], [0, 1, 0, 0, 0, 4], 2, 11],
  ['C/G', 0, '', [3, 3, 2, 0, 1, 0], [4, 3, 2, 0, 1, 0], 2, 7],
  ['C/E', 0, '', [0, 3, 2, 0, 1, 0], [0, 3, 2, 0, 1, 0], 2, 4],
  ['D/F#', 2, '', [2, 0, 0, 2, 3, 2], ['T', 0, 0, 1, 3, 2], 3, 6],
  ['Am/G', 9, 'm', [3, 0, 2, 2, 1, 0], [4, 0, 2, 3, 1, 0], 2, 7],
];

/** 옮길 수 있는 모양: 근음 줄의 프렛 r 기준 상대 프렛 (null = 안 침) */
type Movable = { suffix: string; rel: (number | null)[]; fingers: Finger[]; minR?: number };
const E_FORM: Movable[] = [
  { suffix: '', rel: [0, 2, 2, 1, 0, 0], fingers: [1, 3, 4, 2, 1, 1] },
  { suffix: 'm', rel: [0, 2, 2, 0, 0, 0], fingers: [1, 3, 4, 1, 1, 1] },
  { suffix: '7', rel: [0, 2, 0, 1, 0, 0], fingers: [1, 3, 1, 2, 1, 1] },
  { suffix: 'm7', rel: [0, 2, 0, 0, 0, 0], fingers: [1, 3, 1, 1, 1, 1] },
  { suffix: 'maj7', rel: [0, X, 1, 1, 0, X], fingers: [1, 0, 3, 4, 2, 0] },
  { suffix: 'sus4', rel: [0, 2, 2, 2, 0, 0], fingers: [1, 2, 3, 4, 1, 1] },
  { suffix: '7sus4', rel: [0, 2, 0, 2, 0, 0], fingers: [1, 3, 1, 4, 1, 1] },
  { suffix: 'dim', rel: [0, 1, 2, 0, X, X], fingers: [1, 2, 4, 1, 0, 0] },
  { suffix: 'aug', rel: [0, X, 2, 1, 1, X], fingers: [1, 0, 4, 2, 3, 0] },
];
const A_FORM: Movable[] = [
  { suffix: '', rel: [X, 0, 2, 2, 2, 0], fingers: [0, 1, 2, 3, 4, 1] },
  { suffix: 'm', rel: [X, 0, 2, 2, 1, 0], fingers: [0, 1, 3, 4, 2, 1] },
  { suffix: '7', rel: [X, 0, 2, 0, 2, 0], fingers: [0, 1, 3, 1, 4, 1] },
  { suffix: 'm7', rel: [X, 0, 2, 0, 1, 0], fingers: [0, 1, 3, 1, 2, 1] },
  { suffix: 'maj7', rel: [X, 0, 2, 1, 2, 0], fingers: [0, 1, 3, 2, 4, 1] },
  { suffix: 'sus2', rel: [X, 0, 2, 2, 0, 0], fingers: [0, 1, 3, 4, 1, 1] },
  { suffix: 'sus4', rel: [X, 0, 2, 2, 3, 0], fingers: [0, 1, 2, 3, 4, 1] },
  { suffix: '7sus4', rel: [X, 0, 2, 0, 3, 0], fingers: [0, 1, 3, 1, 4, 1] },
  { suffix: '6', rel: [X, 0, 2, 2, 2, 2], fingers: [0, 1, 3, 3, 3, 3] },
  { suffix: '9', rel: [X, 0, -1, 0, 0, 0], fingers: [0, 2, 1, 3, 3, 3], minR: 1 },
  { suffix: 'm7b5', rel: [X, 0, 1, 0, 1, X], fingers: [0, 1, 3, 2, 4, 0] },
  { suffix: 'dim', rel: [X, 0, 1, 2, 1, X], fingers: [0, 1, 2, 4, 3, 0] },
  { suffix: 'dim7', rel: [X, 0, 1, -1, 1, X], fingers: [0, 2, 3, 1, 4, 0], minR: 1 },
  { suffix: 'aug', rel: [X, 0, -1, -2, -2, X], fingers: [0, 4, 3, 1, 1, 0], minR: 2 },
];

function barreOf(frets: (number | null)[], fingers: Finger[]): ChordShape['barre'] {
  const ones = fingers.map((f, i) => (f === 1 ? i : -1)).filter((i) => i >= 0);
  if (ones.length < 2) return undefined;
  const fret = frets[ones[0]];
  if (fret === null || fret === 0 || ones.some((i) => frets[i] !== fret)) return undefined;
  return { fret, from: ones[0], to: ones[ones.length - 1] };
}

function build(): ChordShape[] {
  const out: ChordShape[] = [];
  for (const [, root, suffix, frets, fingers, level, bass] of OPEN) {
    out.push({ id: `open-${chordName(root, suffix, bass)}`, root, suffix, bass, frets, fingers, level, form: 'open', barre: barreOf(frets, fingers) });
  }
  const forms: [Movable[], 'E' | 'A', number][] = [[E_FORM, 'E', 40], [A_FORM, 'A', 45]];
  for (const [list, form, openMidi] of forms) {
    for (const m of list) {
      for (let root = 0; root < 12; root++) {
        let r = (((root - openMidi) % 12) + 12) % 12;
        if (r === 0) r = 12; // 개방 모양은 OPEN 에 있음 → 12프렛 모양
        if (r < Math.max(m.minR ?? 1, 1 - Math.min(...m.rel.filter((x): x is number => x !== null)))) continue;
        const frets = m.rel.map((x) => (x === null ? null : r + x));
        if (frets.some((f) => f !== null && f > 15)) continue;
        // 낮은 프렛이 덜 어려움: 9프렛 넘으면 중급
        const level: 1 | 2 | 3 = 3;
        out.push({ id: `${form}${r}-${chordName(root, m.suffix)}`, root, suffix: m.suffix, frets, fingers: m.fingers, level, form, barre: barreOf(frets, m.fingers) });
      }
    }
  }
  return out;
}

export const SHAPES: ChordShape[] = build();

/** 한 코드의 모양들: 개방 → 낮은 프렛 순 */
export function shapesFor(root: number, suffix: string, bass?: number): ChordShape[] {
  return SHAPES.filter((s) => s.root === root && s.suffix === suffix && s.bass === bass)
    .sort((a, b) => (a.form === 'open' ? -1 : 0) - (b.form === 'open' ? -1 : 0) || minFret(a) - minFret(b));
}
export function minFret(s: ChordShape): number {
  const f = s.frets.filter((x): x is number => x !== null && x > 0);
  return f.length ? Math.min(...f) : 0;
}
export function maxFret(s: ChordShape): number {
  return Math.max(0, ...s.frets.filter((x): x is number => x !== null));
}

/** 실제 나는 음 (6번 줄부터, 안 치는 줄은 null) */
export function shapeMidis(s: ChordShape, tuning = STANDARD.midi, capo = 0): (number | null)[] {
  return s.frets.map((f, i) => (f === null ? null : tuning[i] + f + capo));
}
/** 줄마다 도수 이름 (R, 3, 5 …) */
export function shapeDegrees(s: ChordShape, tuning = STANDARD.midi): (string | null)[] {
  const t = typeBySuffix(s.suffix) ?? CHORD_TYPES[0];
  return s.frets.map((f, i) => {
    if (f === null) return null;
    const p = (tuning[i] + f) % 12;
    const k = t.iv.findIndex((iv) => (s.root + iv) % 12 === p);
    return k >= 0 ? t.degrees[k] : '?';
  });
}
/** 베이스(가장 낮게 치는 줄) */
export function bassString(s: ChordShape): number {
  return s.frets.findIndex((f) => f !== null);
}
/** 근음이 나는 가장 낮은 줄 (엄지 베이스) */
export function rootString(s: ChordShape, tuning = STANDARD.midi): number {
  const want = s.bass ?? s.root;
  const i = s.frets.findIndex((f, k) => f !== null && (tuning[k] + f) % 12 === want);
  return i >= 0 ? i : bassString(s);
}

/** 입문·초급·중급 묶음 (전환 연습 추천에 씀) */
export const LEVEL_SETS: Record<1 | 2 | 3, string[]> = {
  1: ['C', 'G', 'D', 'Em', 'Am', 'E', 'A', 'Dm'],
  2: ['F', 'G7', 'C7', 'D7', 'E7', 'A7', 'B7', 'Am7', 'Em7', 'Dm7', 'Cmaj7', 'Fmaj7', 'Dsus4', 'Asus2', 'Cadd9', 'G/B'],
  3: ['Bm', 'F#m', 'Bb', 'Cm', 'Gm', 'C#m', 'Ab', 'Eb', 'F#', 'B', 'Fm', 'Bbm', 'D/F#', 'Aadd9'],
};
/** 단계별 전환 연습 쌍 (쉬운 것부터) */
export const CHANGE_PAIRS: Record<1 | 2 | 3, [string, string][]> = {
  1: [['Em', 'G'], ['C', 'G'], ['G', 'D'], ['A', 'D'], ['Am', 'E'], ['C', 'Am'], ['D', 'Em'], ['Am', 'Dm'], ['E', 'A'], ['C', 'D']],
  2: [['C', 'F'], ['Am', 'F'], ['G', 'G7'], ['C', 'C7'], ['D', 'D7'], ['E', 'B7'], ['Cmaj7', 'Fmaj7'], ['G', 'Cadd9'], ['G', 'G/B'], ['Dsus4', 'D']],
  3: [['G', 'Bm'], ['D', 'F#m'], ['Bm', 'G'], ['F', 'Bb'], ['Cm', 'Gm'], ['A', 'C#m'], ['Eb', 'Ab'], ['Em', 'Bm'], ['C', 'D/F#'], ['F#m', 'Bm']],
};
