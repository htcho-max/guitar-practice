/** 조율: 6번 줄(가장 굵은 줄)부터 1번 줄까지 MIDI 번호 */
export interface Tuning { id: string; name: string; midi: number[] }
export const TUNINGS: Tuning[] = [
  { id: 'std', name: '표준 (E A D G B E)', midi: [40, 45, 50, 55, 59, 64] },
  { id: 'half', name: '반음 내림 (Eb Ab Db Gb Bb Eb)', midi: [39, 44, 49, 54, 58, 63] },
  { id: 'dropd', name: '드롭 D (D A D G B E)', midi: [38, 45, 50, 55, 59, 64] },
  { id: 'dadgad', name: 'DADGAD', midi: [38, 45, 50, 55, 57, 62] },
  { id: 'openg', name: '오픈 G (D G D G B D)', midi: [38, 43, 50, 55, 59, 62] },
  { id: 'opend', name: '오픈 D (D A D F# A D)', midi: [38, 45, 50, 54, 57, 62] },
];
export const STANDARD = TUNINGS[0];
export const tuningById = (id: string) => TUNINGS.find((t) => t.id === id) ?? STANDARD;
/** 줄 번호(1~6) ↔ 배열 위치(0=6번 줄) */
export const stringNo = (idx: number) => 6 - idx;

/** 글(디렉티브) → 조율 id: "DADGAD", "drop d", "open g", "표준" … */
export function tuningFromText(t: string): string | null {
  const k = t.toLowerCase().replace(/[\s_\-()]/g, '');
  if (!k) return null;
  if (TUNINGS.some((x) => x.id === k)) return k;
  if (/^(standard|표준|eadgbe)/.test(k)) return 'std';
  if (/^(half|반음|eb)/.test(k)) return 'half';
  if (/^(dropd|드롭d|dadgbe)/.test(k)) return 'dropd';
  if (/^(opend|오픈d|dadf#ad)/.test(k)) return 'opend';
  if (/^(openg|오픈g|dgdgbd)/.test(k)) return 'openg';
  return null;
}

/** 지금 조율 → 새 조율: 바꿔야 하는 줄 */
export function tuningDiff(from: number[], to: number[]): { idx: number; from: number; to: number; semis: number }[] {
  return to.map((m, i) => ({ idx: i, from: from[i], to: m, semis: m - from[i] })).filter((d) => d.semis !== 0);
}

/** 곡의 으뜸음(0=C) → 어울리는 변칙 조율 (개방 줄이 으뜸음·5도 베이스가 되게) */
export function suggestTunings(tonic: number): { id: string; why: string }[] {
  const out: { id: string; why: string }[] = [];
  if (tonic === 2) out.push({ id: 'dropd', why: '6번 줄 D 개방 베이스 — 표준에서 한 줄만 바꿔요' }, { id: 'dadgad', why: 'D 조에서 개방 줄이 울려 퍼지는 소리 (켈틱·뉴에이지)' }, { id: 'opend', why: '개방 줄이 D 메이저 코드 — 슬라이드·하모닉스가 쉬워요' });
  else if (tonic === 7) out.push({ id: 'openg', why: '개방 줄이 G 메이저 코드 — 한 손가락 바레로 코드' }, { id: 'dropd', why: 'G 조의 5도(D) 베이스를 낮게' });
  else if (tonic === 9) out.push({ id: 'dadgad', why: 'A 는 DADGAD 의 개방 5번 줄 — 서스 느낌' }, { id: 'dropd', why: '5번 줄 A 개방 베이스 + 낮은 D' });
  else if (tonic === 4 || tonic === 11) out.push({ id: 'std', why: '표준 조율에서 E·B 개방 줄이 잘 울려요' });
  else if (tonic === 3 || tonic === 8 || tonic === 1) out.push({ id: 'half', why: '반음 내림이면 플랫 조를 개방 줄로' });
  if (!out.some((x) => x.id === 'std')) out.push({ id: 'std', why: '표준 조율' });
  return out;
}
