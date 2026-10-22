import { durToken } from '../fingerstyle/melody';
import type { TabNote } from './parse';

/** 탭 글 만들기용 사건 (perc = 몸통 치기만) */
export interface TEvent { beat: number; notes: TabNote[]; perc?: boolean }

const LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];

/** 한 음 글자: 12, <12> 자연, [12] 인공, t12 탭핑, x 뮤트, S 슬랩 */
export function noteToken(n: TabNote): string {
  if (n.slap) return 'S';
  if (n.dead) return 'x';
  if (n.harm) return `<${n.fret}>`;
  if (n.art) return `[${n.fret}]`;
  if (n.tap) return `t${n.fret}`;
  return (n.tech && /[hp/\\]/.test(n.tech) ? n.tech : '') + n.fret;
}

/**
 * 사건들 → 리듬 줄 + 6줄 (마디마다 | ). from~to 박, 마디 beatsPerBar.
 * 길이는 다음 사건까지 (리듬 글자로 못 적는 길이는 가장 가까운 것)
 */
export function renderTabRows(events: TEvent[], from: number, to: number, beatsPerBar: number): string[] {
  const evs = events.filter((e) => e.beat >= from - 1e-6 && e.beat < to - 1e-6).sort((a, b) => a.beat - b.beat);
  const strs = LABELS.map(() => '');
  let rhythm = '';
  for (let ms = from; ms < to - 1e-6; ms += beatsPerBar) {
    const me = ms + beatsPerBar;
    strs.forEach((_, i) => { strs[i] += '|'; });
    rhythm += '|';
    for (const e of evs.filter((x) => x.beat >= ms - 1e-6 && x.beat < me - 1e-6)) {
      const k = evs.indexOf(e);
      const end = k + 1 < evs.length ? evs[k + 1].beat : to;
      const tok = durToken(end - e.beat) ?? nearestTok(end - e.beat);
      const cells = ['', '', '', '', '', ''];
      for (const n of e.notes) cells[n.string] = noteToken(n);
      if (e.perc) { if (!cells[0]) cells[0] = 'x'; if (!cells[1]) cells[1] = 'x'; }
      // 숫자(또는 기호) 첫 글자가 칸의 둘째 자리에 오게
      const lead = (t: string) => (/^[<[]/.test(t) || /^[hp/\\]/.test(t) ? '' : '-');
      const w = Math.max(2, ...cells.map((c) => c.length + (lead(c) ? 0 : -1) + 1), tok.length);
      strs.forEach((_, i) => {
        const t = cells[5 - i];
        strs[i] += (t ? lead(t) + t : '-').padEnd(w + 1, '-');
      });
      rhythm += (' ' + tok).padEnd(w + 1, ' ');
    }
    strs.forEach((_, i) => { strs[i] += '-'; });
    rhythm += ' ';
  }
  return ['R' + rhythm + '|', ...strs.map((s, i) => LABELS[5 - i] + s + '|')];
}

function nearestTok(d: number): string {
  const opts = ['w', 'h.', 'h', 'q.', 'q', 'e.', 'e', 's', 't', 'T'];
  const val = (t: string) => ({ w: 4, h: 2, q: 1, e: 0.5, s: 0.25, t: 1 / 3, T: 2 / 3 } as Record<string, number>)[t[0]] * (t.endsWith('.') ? 1.5 : 1);
  return opts.reduce((b, t) => (Math.abs(val(t) - d) < Math.abs(val(b) - d) ? t : b), 'q');
}
