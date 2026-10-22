import { rootString, type ChordShape } from '../guitar/chords';
import { STANDARD } from '../guitar/tunings';

/** 오른손 역할: p 엄지(근음), p2 엄지(교대 베이스), i 검지(3번 줄), m 중지(2번 줄), a 약지(1번 줄), x 몸통 치기 */
export type Role = 'p' | 'p2' | 'i' | 'm' | 'a' | 'x';

export interface Pattern {
  id: string;
  /** 내가 만든 패턴 */
  custom?: boolean;
  name: string;
  level: 1 | 2 | 3;
  /** 한 마디 박 수 */
  beats: number;
  /** 한 박을 몇 칸으로 (1=4분, 2=8분, 4=16분) */
  sub: number;
  /** 칸마다 토큰. '-' 쉼, '+' 로 동시에 (p+a = 핀치) */
  seq: string;
  tip: string;
  /** 추천 템포 (시작 → 목표) */
  bpm: [number, number];
}

export const PATTERNS: Pattern[] = [
  { id: 'thumb', name: '엄지 베이스', level: 1, beats: 4, sub: 1, seq: 'p p2 p p2', tip: '엄지로 근음과 다른 베이스 줄을 번갈아 칩니다. 손목은 가만히, 엄지만 움직이세요.', bpm: [60, 100] },
  { id: 'pima', name: 'p-i-m-a 오르기', level: 1, beats: 4, sub: 2, seq: 'p i m a p i m a', tip: '엄지 다음 검지·중지·약지가 차례로. 손가락은 줄을 손바닥 쪽으로 당기듯이.', bpm: [50, 90] },
  { id: 'pami', name: 'p-a-m-i 내리기', level: 1, beats: 4, sub: 2, seq: 'p a m i p a m i', tip: '오르기의 반대. 약지가 가장 약하니 소리 크기를 맞춰 보세요.', bpm: [50, 90] },
  { id: 'block', name: '블록 코드 + 교대 베이스', level: 2, beats: 4, sub: 1, seq: 'p i+m+a p2 i+m+a', tip: '엄지 다음 세 손가락이 함께 줄을 잡아 뜯습니다. 세 음이 한 소리로 나게.', bpm: [60, 110] },
  { id: 'pimi', name: 'p-i-m-i 반복', level: 2, beats: 4, sub: 2, seq: 'p i m i p2 i m i', tip: '검지와 중지가 번갈아. 엄지는 1·3박에 베이스를 바꿔요.', bpm: [60, 100] },
  { id: 'waltz', name: '3/4 아르페지오', level: 2, beats: 3, sub: 2, seq: 'p i m a m i', tip: '왈츠 느낌. 첫 박 엄지를 조금 세게.', bpm: [60, 110] },
  { id: 'pinch', name: '핀치 아르페지오', level: 2, beats: 4, sub: 2, seq: 'p+a i m i p2+a i m i', tip: '엄지와 약지를 동시에 집듯이 뜯습니다 (핀치).', bpm: [55, 95] },
  { id: 'travis', name: '트래비스 피킹', level: 3, beats: 4, sub: 2, seq: 'p m p2 i p m p2 i', tip: '엄지는 매 박 베이스를 교대로, 손가락은 엇박에. 엄지가 메트로놈처럼 흔들리지 않게.', bpm: [60, 120] },
  { id: 'travis-pinch', name: '트래비스 + 핀치', level: 3, beats: 4, sub: 2, seq: 'p+a m p2 i p m p2+a i', tip: '1박과 4박 앞에 핀치. 엄지 박자는 그대로 유지.', bpm: [60, 110] },
  { id: 'perc', name: '퍼커시브 (2·4박 히트)', level: 3, beats: 4, sub: 2, seq: 'p i x m p2 i x m', tip: 'x 자리는 손바닥(엄지 아래)으로 줄을 치며 소리를 죽입니다. 스네어 드럼 느낌.', bpm: [70, 110] },
  { id: 'sixteen', name: '16분 아르페지오', level: 3, beats: 4, sub: 4, seq: 'p i m a m i m i p2 i m a m i m i', tip: '느린 템포에서 고르게. 16분이 흔들리면 템포를 낮추세요.', bpm: [50, 90] },
];
const custom: Pattern[] = [];
/** 내 패턴 (앱 시작할 때 kv 에서 읽어 넣음) */
export function setCustomPatterns(list: Pattern[]) { custom.splice(0, custom.length, ...list.map((p) => ({ ...p, custom: true }))); }
export function allPatterns(): Pattern[] { return [...PATTERNS, ...custom]; }
export const patternById = (id: string) => allPatterns().find((p) => p.id === id) ?? PATTERNS[0];

/** 칸마다 역할 목록 → seq 글자 */
export function toSeq(cells: Role[][]): string {
  return cells.map((c) => (c.length ? c.join('+') : '-')).join(' ');
}

/** 연습용 코드 진행 */
export const PROGRESSIONS: { level: 1 | 2 | 3; chords: string[] }[] = [
  { level: 1, chords: ['C'] }, { level: 1, chords: ['Am'] }, { level: 1, chords: ['G'] },
  { level: 1, chords: ['C', 'Am'] }, { level: 1, chords: ['G', 'Em'] }, { level: 1, chords: ['Em', 'Am'] },
  { level: 2, chords: ['C', 'G', 'Am', 'F'] }, { level: 2, chords: ['G', 'D', 'Em', 'C'] }, { level: 2, chords: ['Am', 'F', 'C', 'G'] },
  { level: 2, chords: ['C', 'Am', 'Dm', 'G'] }, { level: 2, chords: ['Am', 'Dm', 'E', 'Am'] },
  { level: 3, chords: ['D', 'A', 'Bm', 'G'] }, { level: 3, chords: ['Cmaj7', 'Fmaj7'] }, { level: 3, chords: ['G', 'D/F#', 'Em', 'C'] },
  { level: 3, chords: ['Am', 'G', 'F', 'E'] },
];

export interface NoteOut { string: number; fret: number; midi: number }
export interface Step { /** 마디 안 박 위치 */ beat: number; slot: number; roles: Role[]; notes: NoteOut[]; hit: boolean }

export function slots(p: Pattern): string[][] {
  return p.seq.trim().split(/\s+/).map((t) => (t === '-' ? [] : t.split('+')));
}

/** 역할 → 줄 (0 = 6번 줄). 안 치는 줄이면 개방 음이 코드 음일 때만 개방으로 */
export function roleString(role: Role, shape: ChordShape, tuning = STANDARD.midi): number {
  const p = rootString(shape, tuning);
  switch (role) {
    case 'p': return p;
    case 'p2': {
      const cands = p <= 1 ? [2, 1] : [1, 3];
      return cands.find((s) => s !== p && fretFor(s, shape, tuning) !== null) ?? p;
    }
    case 'i': return 3;
    case 'm': return 4;
    case 'a': return 5;
    default: return -1;
  }
}

function fretFor(s: number, shape: ChordShape, tuning: number[]): number | null {
  const f = shape.frets[s];
  if (f !== null) return f;
  const pcs = new Set(shape.frets.map((x, i) => (x === null ? -1 : (tuning[i] + x) % 12)));
  return pcs.has(tuning[s] % 12) ? 0 : null;
}

/** 패턴을 한 코드에 입혀서 한 마디 */
export function realize(p: Pattern, shape: ChordShape, tuning = STANDARD.midi, capo = 0): Step[] {
  return slots(p).map((roles, slot) => {
    const notes: NoteOut[] = [];
    for (const r of roles as Role[]) {
      if (r === 'x') continue;
      const s = roleString(r, shape, tuning);
      const f = fretFor(s, shape, tuning);
      if (s < 0 || f === null || notes.some((n) => n.string === s)) continue;
      notes.push({ string: s, fret: f, midi: tuning[s] + f + capo }); // 프렛은 카포 기준
    }
    return { beat: slot / p.sub, slot, roles: roles as Role[], notes, hit: roles.includes('x') };
  });
}
