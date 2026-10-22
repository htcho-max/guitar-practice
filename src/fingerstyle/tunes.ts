/** 핑거스타일 연습곡 — 모두 저작권이 끝난 곡 (전래·1785 이전·19세기) */
export interface Tune { id: string; title: string; credit: string; beats: number; tempo: number; melody: string; chords: string; level: 1 | 2 | 3 }

export const TUNES: Tune[] = [
  {
    id: 'twinkle', title: '반짝반짝 작은 별', credit: '프랑스 민요', beats: 4, tempo: 80, level: 1,
    melody: `C4q C4q G4q G4q | A4q A4q G4h | F4q F4q E4q E4q | D4q D4q C4h |
G4q G4q F4q F4q | E4q E4q D4h | G4q G4q F4q F4q | E4q E4q D4h |
C4q C4q G4q G4q | A4q A4q G4h | F4q F4q E4q E4q | D4q D4q C4h`,
    chords: '| C | F C | F C | G C | C F | C G | C F | C G | C | F C | F C | G C |',
  },
  {
    id: 'ode', title: '환희의 송가', credit: '베토벤', beats: 4, tempo: 84, level: 1,
    melody: `B4q B4q C5q D5q | D5q C5q B4q A4q | G4q G4q A4q B4q | B4q. A4e A4h |
B4q B4q C5q D5q | D5q C5q B4q A4q | G4q G4q A4q B4q | A4q. G4e G4h`,
    chords: '| G | D | G | G D | G | D | G | D G |',
  },
  {
    id: 'jingle', title: '징글벨 (후렴)', credit: 'J. 피어폰트', beats: 4, tempo: 96, level: 2,
    melody: `B4q B4q B4h | B4q B4q B4h | B4q D5q G4q. A4e | B4w |
C5q C5q C5q. C5e | C5q B4q B4q B4e B4e | B4q A4q A4q B4q | A4h D5h |
B4q B4q B4h | B4q B4q B4h | B4q D5q G4q. A4e | B4w |
C5q C5q C5q. C5e | C5q B4q B4q B4e B4e | D5q D5q C5q A4q | G4w`,
    chords: '| G | G | G | G | C | G | A | D | G | G | G | G | C | G | D | G |',
  },
  {
    id: 'amazing', title: 'Amazing Grace', credit: 'J. 뉴턴 (1779)', beats: 3, tempo: 76, level: 2,
    melody: `rh A3q | D4h F#4e D4e | F#4h E4q | D4h B3q | A3h A3q | D4h F#4e D4e | F#4h E4q | A4h. | A4h F#4q |
A4q. F#4e A4e F#4e | D4h A3q | B3q. D4e D4e B3e | A3h A3q | D4h F#4e D4e | F#4h E4q | D4h.`,
    chords: '| D | D | D | G | D | D | D | A | A | D | D | G | D | D | A | D |',
  },
  {
    id: 'greensleeves', title: 'Greensleeves', credit: '잉글랜드 민요', beats: 3, tempo: 84, level: 3,
    melody: `rh A4q | C5h D5q | E5q. F5e E5q | D5h B4q | G4q. A4e B4q | C5h A4q | A4q. G#4e A4q | B4h G#4q | E4h A4q |
C5h D5q | E5q. F5e E5q | D5h B4q | G4q. A4e B4q | C5q. B4e A4q | G#4q. F#4e G#4q | A4h.`,
    chords: '| Am | Am | Am | G | Em | Am | Am | E | E | Am | Am | G | Em | Am | E | Am |',
  },
];
export const tuneById = (id: string) => TUNES.find((t) => t.id === id) ?? TUNES[0];
