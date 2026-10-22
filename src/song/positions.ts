/** 손 위치 지도: 마디마다 왼손이 머무는 프렛, 크게 옮기는 곳 */
export interface PosNote { string: number; fret: number; harm?: boolean; art?: boolean; tap?: boolean; dead?: boolean }
export interface PosEvent { beat: number; notes: PosNote[] }
export interface BarPos { bar: number; /** 검지 자리 (짚는 음이 없으면 null) */ pos: number | null; lo: number; hi: number }
export interface Shift { bar: number; from: number; to: number; /** 옮긴 뒤 첫 사건 박 */ beat: number }

const fretted = (n: PosNote) => n.fret > 0 && !n.dead && !n.harm && !n.tap;

export function barPositions(events: PosEvent[], beatsPerBar: number, bars: number): BarPos[] {
  const out: BarPos[] = [];
  for (let m = 0; m < bars; m++) {
    const fs = events.filter((e) => e.beat >= m * beatsPerBar - 1e-6 && e.beat < (m + 1) * beatsPerBar - 1e-6).flatMap((e) => e.notes.filter(fretted).map((n) => n.fret));
    out.push(fs.length ? { bar: m, pos: Math.min(...fs), lo: Math.min(...fs), hi: Math.max(...fs) } : { bar: m, pos: null, lo: 0, hi: 0 });
  }
  return out;
}

/** 손을 minJump 프렛 이상 옮기는 곳 (마디 안에서 옮기는 것도) */
export function findShifts(events: PosEvent[], beatsPerBar: number, minJump = 4): Shift[] {
  const out: Shift[] = [];
  let hand: number | null = null;
  for (const e of [...events].sort((a, b) => a.beat - b.beat)) {
    const fs = e.notes.filter(fretted).map((n) => n.fret);
    if (!fs.length) continue;
    const lo = Math.min(...fs), hi = Math.max(...fs);
    if (hand === null) { hand = lo; continue; }
    // 손 폭(4프렛) 안이면 그대로
    if (lo >= hand && hi <= hand + 3) continue;
    const next: number = lo < hand ? lo : Math.max(lo, hi - 3);
    if (Math.abs(next - hand) >= minJump) out.push({ bar: Math.floor(e.beat / beatsPerBar + 1e-6), from: hand, to: next, beat: e.beat });
    hand = next;
  }
  return out;
}

export const zoneOf = (pos: number | null) => (pos === null ? 'open' : pos <= 4 ? 'low' : pos <= 9 ? 'mid' : 'high');
