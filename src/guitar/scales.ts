import { STANDARD } from './tunings';

export interface ScaleDef { id: string; name: string; iv: number[]; degrees: string[]; perString: 2 | 3; level: 1 | 2 | 3 }
export const SCALES: ScaleDef[] = [
  { id: 'minpent', name: '마이너 펜타토닉', iv: [0, 3, 5, 7, 10], degrees: ['R', 'b3', '4', '5', 'b7'], perString: 2, level: 1 },
  { id: 'majpent', name: '메이저 펜타토닉', iv: [0, 2, 4, 7, 9], degrees: ['R', '2', '3', '5', '6'], perString: 2, level: 2 },
  { id: 'blues', name: '블루스', iv: [0, 3, 5, 6, 7, 10], degrees: ['R', 'b3', '4', 'b5', '5', 'b7'], perString: 2, level: 2 },
  { id: 'major', name: '메이저 (3음씩)', iv: [0, 2, 4, 5, 7, 9, 11], degrees: ['R', '2', '3', '4', '5', '6', '7'], perString: 3, level: 3 },
  { id: 'minor', name: '내추럴 마이너 (3음씩)', iv: [0, 2, 3, 5, 7, 8, 10], degrees: ['R', '2', 'b3', '4', '5', 'b6', 'b7'], perString: 3, level: 3 },
];
export const scaleById = (id: string) => SCALES.find((s) => s.id === id) ?? SCALES[0];

export interface FretNote { string: number; fret: number; midi: number; degree: string }

/** 지판 전체의 스케일 음 (0~maxFret) */
export function neckNotes(sc: ScaleDef, root: number, tuning = STANDARD.midi, maxFret = 15): FretNote[] {
  const out: FretNote[] = [];
  tuning.forEach((open, s) => {
    for (let f = 0; f <= maxFret; f++) {
      const m = open + f;
      const k = sc.iv.indexOf((((m - root) % 12) + 12) % 12);
      if (k >= 0) out.push({ string: s, fret: f, midi: m, degree: sc.degrees[k] });
    }
  });
  return out;
}

/**
 * 포지션(박스): 6번 줄의 n번째 스케일 음에서 시작해 줄마다 perString 개씩, 음 높이 순서로.
 * 블루스는 마이너 펜타토닉 박스에 b5 를 박스 안 프렛에 더함
 */
export function boxNotes(sc: ScaleDef, root: number, pos: number, tuning = STANDARD.midi): FretNote[] {
  const base = sc.id === 'blues' ? scaleById('minpent') : sc;
  const n = base.iv.length;
  // 6번 줄 근음 프렛 (0~11)
  const r0 = (((root - tuning[0]) % 12) + 12) % 12;
  let start = tuning[0] + r0 + base.iv[pos % n] + (pos >= n ? 12 : 0);
  // 6번 줄 첫 프렛이 너무 높으면 한 옥타브 아래로
  if (start - tuning[0] > 12) start -= 12;
  const seq: number[] = [];
  // 시작음부터 스케일 음을 차례로
  for (let m = start; seq.length < base.perString * tuning.length + 2; m++) {
    if (base.iv.includes((((m - root) % 12) + 12) % 12)) seq.push(m);
  }
  const out: FretNote[] = [];
  let k = 0;
  tuning.forEach((open, s) => {
    for (let j = 0; j < base.perString; j++) {
      const m = seq[k++];
      const f = m - open;
      out.push({ string: s, fret: f, midi: m, degree: base.degrees[base.iv.indexOf((((m - root) % 12) + 12) % 12)] });
    }
  });
  if (sc.id === 'blues') {
    const lo = Math.min(...out.map((x) => x.fret)), hi = Math.max(...out.map((x) => x.fret));
    tuning.forEach((open, s) => {
      for (let f = lo; f <= hi; f++) {
        const m = open + f;
        if ((((m - root) % 12) + 12) % 12 === 6 && !out.some((x) => x.midi === m)) out.push({ string: s, fret: f, midi: m, degree: 'b5' });
      }
    });
    out.sort((a, b) => a.midi - b.midi);
  }
  // 음수 프렛이면 한 옥타브 위로
  if (out.some((x) => x.fret < 0)) return out.map((x) => ({ ...x, fret: x.fret + 12, midi: x.midi + 12 }));
  // 너무 높으면 한 옥타브 아래로
  if (Math.max(...out.map((x) => x.fret)) > 15 && Math.min(...out.map((x) => x.fret)) >= 12) return out.map((x) => ({ ...x, fret: x.fret - 12, midi: x.midi - 12 }));
  return out;
}
export const positionCount = (sc: ScaleDef) => (sc.id === 'blues' ? 5 : sc.iv.length);

/** 줄·프렛 → 음 (0 = 6번 줄) */
export const midiAt = (s: number, f: number, tuning = STANDARD.midi) => tuning[s] + f;
