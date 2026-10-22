import type { ParsedSong, TabNote } from './parse';

export type TimelineItem =
  | { kind: 'chord'; beat: number; dur: number; chord: string; block: number; seg: number }
  | { kind: 'tab'; beat: number; block: number; event: number; notes: TabNote[] };

export interface Timeline { items: TimelineItem[]; beats: number; /** 블록마다 시작 박 (재생 위치 → 화면) */ blockStart: number[] }

/** 곡 → 박 위치 목록 (가사 줄 코드 하나 = chordBeats 박, 마디 줄은 칸 수로 나눔, 탭은 탭 박) */
export function buildTimeline(song: ParsedSong): Timeline {
  const bar = song.meta.beats;
  const per = song.meta.chordBeats || bar;
  const items: TimelineItem[] = [];
  const blockStart: number[] = [];
  let t = 0;
  let lastChord: (TimelineItem & { kind: 'chord' }) | null = null;
  song.blocks.forEach((b, bi) => {
    blockStart.push(t);
    if (b.kind === 'line') {
      b.segs.forEach((s, si) => {
        if (!s.chord) return;
        lastChord = { kind: 'chord', beat: t, dur: per, chord: s.chord, block: bi, seg: si };
        items.push(lastChord);
        t += per;
      });
    } else if (b.kind === 'bars') {
      let k = 0;
      for (const barToks of b.bars) {
        const d = bar / barToks.length;
        for (const tok of barToks) {
          if ((tok === '.' || tok === '/' || tok === '%') && lastChord) lastChord.dur += d;
          else if (tok !== '.' && tok !== '/' && tok !== '%') {
            lastChord = { kind: 'chord', beat: t, dur: d, chord: tok, block: bi, seg: k };
            items.push(lastChord);
          }
          k++;
          t += d;
        }
      }
    } else if (b.kind === 'tab') {
      b.events.forEach((e, ei) => items.push({ kind: 'tab', beat: t + e.beat, block: bi, event: ei, notes: e.notes }));
      t += b.beats;
      lastChord = null;
    }
  });
  return { items, beats: t, blockStart };
}

/** 긁기 패턴 기본값 */
export function defaultStrum(beats: number): string {
  if (beats === 3) return 'D-DUDU';
  if (beats === 6) return 'D-UD-U';
  if (beats === 2) return 'D-DU';
  return 'D-DU-UDU';
}
