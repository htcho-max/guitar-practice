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
