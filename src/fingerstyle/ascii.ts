import { durToken } from './melody';
import type { Arrangement } from './arrange';

const LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];

/** 편곡 → ChordPro 곡 글 (탭 + 리듬 줄, 줄마다 barsPerLine 마디, 위에 코드 주석) */
export function toSongText(arr: Arrangement, o: { title: string; artist?: string; tempo?: number; barsPerLine?: number; note?: string }): string {
  const bpl = o.barsPerLine ?? 2;
  const bars = arr.beats / arr.beatsPerBar;
  const out: string[] = [`{title: ${o.title}}`];
  if (o.artist) out.push(`{artist: ${o.artist}}`);
  out.push(`{time: ${arr.beatsPerBar}/4}`);
  if (o.tempo) out.push(`{tempo: ${o.tempo}}`);
  if (o.note) out.push(`{c: ${o.note}}`);
  for (let b0 = 0; b0 < bars; b0 += bpl) {
    const from = b0 * arr.beatsPerBar, to = Math.min(bars, b0 + bpl) * arr.beatsPerBar;
    const evs = arr.events.filter((e) => e.beat >= from - 1e-6 && e.beat < to - 1e-6);
    const chordsHere = arr.chords.filter((c) => c.beat >= from - 1e-6 && c.beat < to - 1e-6);
    const strs = LABELS.map(() => '');
    let rhythm = '';
    const barLabels: string[] = [];
    for (let m = b0; m < Math.min(bars, b0 + bpl); m++) {
      strs.forEach((_, i) => { strs[i] += '|'; });
      rhythm += '|';
      const mEvs = evs.filter((e) => e.beat >= m * arr.beatsPerBar - 1e-6 && e.beat < (m + 1) * arr.beatsPerBar - 1e-6);
      barLabels.push(chordsHere.filter((c) => c.beat >= m * arr.beatsPerBar - 1e-6 && c.beat < (m + 1) * arr.beatsPerBar - 1e-6).map((c) => c.name).join(' ') || '·');
      for (const e of mEvs) {
        const k = evs.indexOf(e);
        const end = k + 1 < evs.length ? evs[k + 1].beat : to;
        const tok = durToken(end - e.beat) ?? 'q';
        const fr = new Map(e.notes.map((n) => [n.string, String(n.fret)]));
        strs.forEach((_, i) => {
          const s = 5 - i; // 위 줄 = 1번 줄
          const f = fr.get(s);
          strs[i] += '-' + (f ? f.padEnd(2, '-') : '--');
        });
        rhythm += '-' + tok.padEnd(2, ' ').replace(/ /g, ' ');
      }
      strs.forEach((_, i) => { strs[i] += '-'; });
      rhythm += ' ';
    }
    out.push('', `{c: ${barLabels.join(' | ')}}`);
    out.push('R' + rhythm.replace(/-/g, ' ') + '|');
    strs.forEach((s, i) => out.push(LABELS[5 - i] + s + '|'));
  }
  return out.join('\n');
}
