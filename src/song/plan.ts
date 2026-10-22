import type { Timeline } from './timeline';
import { defaultStrum } from './timeline';
import { shapeMidis, chordPcs, type ChordShape } from '../guitar/chords';
import { patternById, realize } from '../finger/patterns';
import { parseChord } from '../guitar/symbols';

export type Vis = { block: number; seg?: number; event?: number };
export type Sound =
  | { kind: 'strum'; midis: (number | null)[]; dir: 'down' | 'up'; vel: number }
  | { kind: 'notes'; notes: { midi: number; string: number }[]; vel: number }
  | { kind: 'chuck' } | { kind: 'hit' };
export interface PlanEvent {
  beat: number;
  vis?: Vis;
  sound?: Sound;
  /** 따라 치기에서 기대하는 것 (pcs 가 비면 박자만) */
  expect?: { pcs: number[]; hit: boolean };
  /** 이 코드가 맞게 울리는지 확인할 때 (코드 칸 가운데쯤) */
  check?: { key: string; name: string; pcs: number[]; bass?: number; /** 소리를 들어 볼 박 */ at: number };
}
export type Accomp = 'strum' | 'finger' | 'once' | 'none';
export interface PlanOpts {
  beatsPerBar: number;
  tuning: number[];
  /** 지금 끼운 카포 (코드 모양 소리) */
  capo: number;
  /** 탭 소리 올림 (곡 카포 + 조) */
  tabShift: number;
  accomp: Accomp;
  strum: string;
  fingerId: string;
  /** 적힌 코드 → 잡는 모양 이름 */
  shown: (name: string) => string;
  shapeOf: (name: string) => ChordShape | null;
}

/** 곡 박 목록 → 소리·화면·기대 사건 */
export function buildPlan(tl: Timeline, o: PlanOpts): PlanEvent[] {
  const out: PlanEvent[] = [];
  const bar = o.beatsPerBar;
  const strumPat = o.strum.replace(/\s/g, '') || defaultStrum(bar);
  const L = strumPat.length, slot = bar / L;
  const pat = patternById(o.fingerId);
  for (const it of tl.items) {
    if (it.kind === 'tab') {
      const live = it.notes.filter((n) => !n.dead);
      const notes = live.map((n) => ({ midi: o.tuning[n.string] + n.fret + o.tabShift, string: n.string }));
      out.push({
        beat: it.beat, vis: { block: it.block, event: it.event },
        sound: notes.length ? { kind: 'notes', notes, vel: 0.8 } : { kind: 'chuck' },
        expect: { pcs: [...new Set(notes.map((n) => n.midi % 12))], hit: !notes.length },
      });
      continue;
    }
    const name = o.shown(it.chord);
    const shape = o.shapeOf(name);
    const sym = parseChord(name);
    const ev: PlanEvent = { beat: it.beat, vis: { block: it.block, seg: it.seg } };
    if (shape && sym) {
      const root = (sym.root + o.capo) % 12;
      ev.check = { key: `${it.block}:${it.seg}`, name, pcs: chordPcs(root, shape.suffix), bass: shape.bass === undefined ? undefined : (shape.bass + o.capo) % 12, at: it.beat + Math.min(it.dur * 0.5, 2) };
    }
    out.push(ev);
    if (!shape || o.accomp === 'none') continue;
    const midis = shapeMidis(shape, o.tuning, o.capo);
    const end = it.beat + it.dur;
    if (o.accomp === 'once') {
      out.push({ beat: it.beat, sound: { kind: 'strum', midis, dir: 'down', vel: 0.75 }, expect: { pcs: [], hit: true } });
    } else if (o.accomp === 'strum') {
      for (let g = Math.ceil(it.beat / slot - 1e-6); g * slot < end - 1e-6; g++) {
        let ch = strumPat[g % L];
        if (g * slot - it.beat < 1e-6 && ch !== 'D' && ch !== 'd' && ch !== 'x') ch = 'D'; // 코드가 바뀌는 자리는 내려 긋기
        const b = g * slot;
        if (ch === 'D' || ch === 'd') out.push({ beat: b, sound: { kind: 'strum', midis, dir: 'down', vel: g % L === 0 ? 0.85 : 0.7 }, expect: { pcs: [], hit: true } });
        else if (ch === 'U' || ch === 'u') out.push({ beat: b, sound: { kind: 'strum', midis, dir: 'up', vel: 0.6 }, expect: { pcs: [], hit: true } });
        else if (ch === 'x' || ch === 'X') out.push({ beat: b, sound: { kind: 'chuck' }, expect: { pcs: [], hit: true } });
      }
    } else {
      const steps = realize(pat, shape, o.tuning, o.capo);
      const per = pat.beats;
      for (let bs = Math.floor(it.beat / per) * per; bs < end; bs += per) {
        for (const st of steps) {
          const b = bs + st.beat;
          if (b < it.beat - 1e-6 || b >= end - 1e-6) continue;
          if (st.hit && !st.notes.length) { out.push({ beat: b, sound: { kind: 'hit' }, expect: { pcs: [], hit: true } }); continue; }
          out.push({ beat: b, sound: { kind: 'notes', notes: st.notes.map((n) => ({ midi: n.midi, string: n.string })), vel: st.slot === 0 ? 0.85 : 0.7 }, expect: { pcs: [...new Set(st.notes.map((n) => n.midi % 12))], hit: false } });
        }
      }
    }
  }
  return out.sort((a, b) => a.beat - b.beat);
}

/** 구간 [from, to) 박만 남기고 0 부터 */
export function slicePlan(plan: PlanEvent[], from: number, to: number): PlanEvent[] {
  return plan.filter((e) => e.beat >= from - 1e-6 && e.beat < to - 1e-6).map((e) => ({ ...e, beat: e.beat - from, check: e.check && { ...e.check, at: Math.min(e.check.at, to) - from } }));
}

/** 블록 구간 → 박 구간 */
export function blockRange(tl: Timeline, a: number, b: number): [number, number] {
  const lo = Math.min(a, b), hi = Math.max(a, b);
  const from = tl.blockStart[lo] ?? 0;
  const to = hi + 1 < tl.blockStart.length ? tl.blockStart[hi + 1] : tl.beats;
  return [from, Math.max(from, to)];
}
