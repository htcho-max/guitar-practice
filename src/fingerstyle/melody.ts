/**
 * 멜로디 글자: 음이름+옥타브+길이 (G4q, F#4e., Bb3h), 쉼은 r (rq, rh.), 마디 | 는 보기용.
 * 길이: w 온 h 2분 q 4분 e 8분 s 16분 t 셋잇단 8분 T 셋잇단 4분, 점 . = 1.5배, 끝에 ~ 는 다음 같은 음과 붙임줄
 */
export interface MelNote { beat: number; dur: number; midi: number | null }

const LETTER: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
export const DURS: Record<string, number> = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25, t: 1 / 3, T: 2 / 3 };
const TOKEN = /^(?:([A-Ga-g])([#b]?)(-?\d)|r)([whqestT])(\.?)(~?)$/;

export function parseMelody(text: string): { notes: MelNote[]; beats: number; errors: string[] } {
  const notes: MelNote[] = [];
  const errors: string[] = [];
  let t = 0;
  let tieOpen = false;
  for (const raw of text.replace(/(^|\s)M\s*[|:]/g, ' ').split(/[\s|]+/)) {
    if (!raw) continue;
    const m = TOKEN.exec(raw);
    if (!m) { errors.push(raw); continue; }
    const dur = DURS[m[4]] * (m[5] ? 1.5 : 1);
    let midi: number | null = null;
    if (m[1]) midi = (Number(m[3]) + 1) * 12 + LETTER[m[1].toUpperCase()] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    const last = notes[notes.length - 1];
    if (tieOpen && last && last.midi === midi) last.dur = Math.round((last.dur + dur) * 1000) / 1000;
    else notes.push({ beat: Math.round(t * 1000) / 1000, dur, midi });
    tieOpen = m[6] === '~';
    t += dur;
  }
  return { notes, beats: Math.round(t * 1000) / 1000, errors };
}

const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
/** 박 길이 → 글자 (못 쓰면 null) */
export function durToken(d: number): string | null {
  for (const [k, v] of Object.entries(DURS)) {
    if (Math.abs(v - d) < 0.01) return k;
    if (Math.abs(v * 1.5 - d) < 0.01) return k + '.';
  }
  return null;
}
export function melodyText(notes: MelNote[]): string {
  return notes.map((n) => (n.midi === null ? 'r' : `${NAMES[n.midi % 12]}${Math.floor(n.midi / 12) - 1}`) + (durToken(n.dur) ?? 'q')).join(' ');
}
