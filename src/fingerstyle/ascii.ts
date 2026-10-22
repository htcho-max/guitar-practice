import { durToken } from './melody';
import type { Arrangement, FsEvent } from './arrange';

const LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
const NOTE_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];

/** 사건 하나의 줄별 글자 (하모닉스 <12>, 퍼커시브 x) */
function cells(e: FsEvent): string[] {
  const out = ['', '', '', '', '', ''];
  for (const n of e.notes) out[n.string] = n.harm ? `<${n.fret}>` : String(n.fret);
  if (e.perc) { if (!out[0]) out[0] = 'x'; if (!out[1]) out[1] = 'x'; }
  return out;
}

/** 편곡 → ChordPro 곡 글 (탭 + 리듬 줄, 줄마다 barsPerLine 마디, 위에 코드 주석) */
export function toSongText(arr: Arrangement, o: { title: string; artist?: string; tempo?: number; barsPerLine?: number; note?: string }): string {
  const bpl = o.barsPerLine ?? 2;
  const bars = arr.beats / arr.beatsPerBar;
  const out: string[] = [`{title: ${o.title}}`];
  if (o.artist) out.push(`{artist: ${o.artist}}`);
  out.push(`{time: ${arr.beatsPerBar}/4}`);
  if (o.tempo) out.push(`{tempo: ${o.tempo}}`);
  const std = arr.tuning.join() === '40,45,50,55,59,64';
  if (!std) out.push(`{c: 조율 ${arr.tuning.map((m) => NOTE_NAMES[m % 12]).join(' ')} (6번 줄부터)}`);
  if (o.note) out.push(`{c: ${o.note}}`);
  const hasHarm = arr.events.some((e) => e.notes.some((n) => n.harm));
  const hasPerc = arr.events.some((e) => e.perc);
  if (hasHarm || hasPerc) out.push(`{c: ${[hasHarm ? '<12> = 자연 하모닉스 (줄 위에 살짝 대고 튕기기)' : '', hasPerc ? 'x = 몸통 치기(퍼커시브)' : ''].filter(Boolean).join(' · ')}}`);
  for (let b0 = 0; b0 < bars; b0 += bpl) {
    const from = b0 * arr.beatsPerBar, to = Math.min(bars, b0 + bpl) * arr.beatsPerBar;
    const evs = arr.events.filter((e) => e.beat >= from - 1e-6 && e.beat < to - 1e-6);
    const strs = LABELS.map(() => '');
    let rhythm = '';
    const barLabels: string[] = [];
    for (let m = b0; m < Math.min(bars, b0 + bpl); m++) {
      strs.forEach((_, i) => { strs[i] += '|'; });
      rhythm += '|';
      const ms = m * arr.beatsPerBar, me = ms + arr.beatsPerBar;
      const mEvs = evs.filter((e) => e.beat >= ms - 1e-6 && e.beat < me - 1e-6);
      barLabels.push(arr.chords.filter((c) => c.beat >= ms - 1e-6 && c.beat < me - 1e-6).map((c) => c.name).join(' ') || '·');
      for (const e of mEvs) {
        const k = evs.indexOf(e);
        const end = k + 1 < evs.length ? evs[k + 1].beat : to;
        const tok = durToken(end - e.beat) ?? 'q';
        const c = cells(e);
        const w = Math.max(2, ...c.map((x) => x.length), tok.length);
        // 숫자 첫 자리 = 칸의 둘째 글자 (하모닉스는 < 다음)
        strs.forEach((_, i) => {
          const s = 5 - i;
          const t = c[s];
          const lead = t.startsWith('<') ? '' : '-';
          strs[i] += (lead + t).padEnd(w + 1, '-');
        });
        rhythm += (' ' + tok).padEnd(w + 1, ' ');
      }
      strs.forEach((_, i) => { strs[i] += '-'; });
      rhythm += ' ';
    }
    out.push('', `{c: ${barLabels.join(' | ')}}`);
    out.push('R' + rhythm + '|');
    strs.forEach((s, i) => out.push(LABELS[5 - i] + s + '|'));
  }
  return out.join('\n');
}
