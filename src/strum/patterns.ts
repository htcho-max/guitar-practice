/** 긁기(스트럼) 패턴: 칸마다 D 내려 긋기, U 올려 긋기, x 뮤트(칙), - 쉼(손은 계속 흔듦) */
export interface StrumPattern {
  id: string;
  custom?: boolean;
  name: string;
  level: 1 | 2 | 3;
  beats: number;
  /** 한 박 칸 수 (2 = 8분, 4 = 16분) */
  sub: number;
  seq: string;
  tip: string;
  bpm: [number, number];
}

export const STRUMS: StrumPattern[] = [
  { id: 'quarter', name: '4분 다운', level: 1, beats: 4, sub: 2, seq: 'D-D-D-D-', tip: '박마다 내려 긋기. 손목을 털듯이, 팔 전체가 아니라 손목으로.', bpm: [60, 110] },
  { id: 'eighth', name: '8분 다운·업', level: 1, beats: 4, sub: 2, seq: 'DUDUDUDU', tip: '내려갈 때 박, 올라올 때 &. 업은 위 3~4줄만 가볍게.', bpm: [60, 100] },
  { id: 'waltz-d', name: '3/4 다운', level: 1, beats: 3, sub: 2, seq: 'D-D-D-', tip: '첫 박을 조금 세게. 하나 둘 셋.', bpm: [60, 110] },
  { id: 'folk', name: '기본 포크 (D-DU-UDU)', level: 2, beats: 4, sub: 2, seq: 'D-DU-UDU', tip: '가장 많이 쓰는 패턴. 3박의 다운을 건너뛸 때도 손은 내려갔다 와야 해요 (허공 긋기).', bpm: [60, 110] },
  { id: 'ddu', name: 'D-D-DUDU', level: 2, beats: 4, sub: 2, seq: 'D-D-DUDU', tip: '앞 두 박은 다운만, 뒤 두 박은 다운·업.', bpm: [60, 110] },
  { id: 'waltz', name: '3/4 왈츠 (D-DUDU)', level: 2, beats: 3, sub: 2, seq: 'D-DUDU', tip: '첫 박 다운만, 둘·셋 박은 다운·업.', bpm: [60, 110] },
  { id: 'chuck', name: '뮤트 칙 (2·4박)', level: 3, beats: 4, sub: 2, seq: 'D-xUD-xU', tip: 'x 자리는 손바닥 옆으로 줄을 덮으며 긁어 "칙" 소리. 스네어처럼.', bpm: [70, 115] },
  { id: 'island', name: '엇박 업 (아일랜드)', level: 3, beats: 4, sub: 2, seq: '-U-U-U-U', tip: '박에서는 허공 다운, &에서만 업. 손은 쉬지 않고 흔들어요.', bpm: [70, 120] },
  { id: 'sixteen', name: '16분 팝', level: 3, beats: 4, sub: 4, seq: 'D-DU-UDU-UDUD-DU', tip: '16분 손 흔들기를 유지하면서 일부만 맞히기. 느리게 시작하세요.', bpm: [50, 90] },
];
const custom: StrumPattern[] = [];
export function setCustomStrums(list: StrumPattern[]) { custom.splice(0, custom.length, ...list.map((p) => ({ ...p, custom: true }))); }
export function allStrums(): StrumPattern[] { return [...STRUMS, ...custom]; }
export const strumById = (id: string) => allStrums().find((s) => s.id === id) ?? STRUMS[0];

/** 칸마다 세는 말 (1 & 2 & / 1 e & a) */
export function countLabel(slot: number, sub: number): string {
  const beat = Math.floor(slot / sub) + 1, k = slot % sub;
  if (k === 0) return String(beat);
  if (sub === 2) return '&';
  if (sub === 3) return k === 1 ? '&' : 'a';
  return ['', 'e', '&', 'a'][k];
}

export interface StrumStroke { beat: number; slot: number; kind: 'D' | 'U' | 'x' }
/** 한 마디의 긋기 (쉼 빼고) */
export function strokes(p: StrumPattern): StrumStroke[] {
  return [...p.seq].map((c, slot) => ({ c, slot })).filter(({ c }) => c === 'D' || c === 'U' || c === 'x')
    .map(({ c, slot }) => ({ beat: slot / p.sub, slot, kind: c as 'D' | 'U' | 'x' }));
}
