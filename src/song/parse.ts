import { isChordToken } from '../guitar/symbols';

export interface Seg { chord?: string; text: string }
export interface TabNote { string: number; fret: number; tech?: string; dead?: boolean }
export interface TabEvent { beat: number; notes: TabNote[]; /** 원래 줄에서 글자 위치 (화면 표시) */ col: number }
export type Block =
  | { kind: 'section'; label: string }
  | { kind: 'comment'; text: string }
  | { kind: 'line'; segs: Seg[] }
  | { kind: 'bars'; bars: string[][] }
  | { kind: 'tab'; lines: string[]; events: TabEvent[]; beats: number; /** 리듬 줄 (있으면) */ rhythm?: string }
  | { kind: 'melody'; text: string }
  | { kind: 'empty' };

export interface SongMeta {
  title: string; artist: string; key: string; capo: number; tempo: number;
  beats: number; unit: number;
  /** 긁기 패턴 (D U - x, 한 마디) */
  strum: string;
  /** 핑거 패턴 id */
  finger: string;
  /** 가사 줄에서 코드 하나가 몇 박 (기본 한 마디) */
  chordBeats: number;
}
export interface ParsedSong { meta: SongMeta; blocks: Block[] }

const DIRECTIVE = /^\{\s*([a-zA-Z_]+)\s*(?::\s*(.*?))?\s*\}$/;
const TAB_LINE = /^\s*([eEBGDAbgda]|[1-6])?\s*[|:]?[-0-9hpbr/\\~x|.()<>^ ]*-[-0-9hpbr/\\~x|.()<>^ ]*$/;
const TAB_LABELED = /^\s*([eEBGDAbgda])\s*[|:]/;
/** 탭 위 리듬 줄: R| q e e s s … (w h q e s, t = 8분 셋잇단, 점 . ) */
const RHYTHM_LINE = /^\s*[Rr]\s*[|:]/;

/** 화면 폭: 한글·한자는 2칸 */
export function colWidth(ch: string): number {
  const c = ch.codePointAt(0) ?? 0;
  return (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0xa4cf) || (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xff00 && c <= 0xff60) ? 2 : 1;
}

function isChordLine(line: string): boolean {
  const toks = line.trim().split(/\s+/).filter((t) => t && t !== '|' && t !== '-' && !/^\(?x\d\)?$/i.test(t));
  return toks.length > 0 && toks.every((t) => isChordToken(t.replace(/^\(|\)$/g, '')));
}

/** [C]가사 [G]가사 */
function parseInline(line: string): Seg[] {
  const segs: Seg[] = [];
  const re = /\[([^\]]+)\]/g;
  let last = 0, chord: string | undefined, m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const text = line.slice(last, m.index);
    if (text || chord !== undefined) segs.push({ chord, text });
    chord = m[1].trim();
    last = m.index + m[0].length;
  }
  segs.push({ chord, text: line.slice(last) });
  return segs.filter((s, i) => s.chord !== undefined || s.text || i === 0);
}

/** 코드 줄 + 가사 줄 → 마디 위치 맞춰 합치기 */
function mergeChordLyric(chordLine: string, lyric: string): Seg[] {
  const chords: { col: number; name: string }[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chordLine))) {
    const name = m[0].replace(/^\(|\)$/g, '');
    if (isChordToken(name)) chords.push({ col: displayCol(chordLine, m.index), name });
  }
  // 가사 글자마다 화면 칸
  const cols: number[] = [];
  let c = 0;
  for (const ch of lyric) { cols.push(c); c += colWidth(ch); }
  const chars = [...lyric];
  const segs: Seg[] = [];
  const firstIdx = chords.length ? idxAt(cols, chords[0].col) : chars.length;
  if (firstIdx > 0) segs.push({ text: chars.slice(0, firstIdx).join('') });
  chords.forEach((ch, k) => {
    const from = idxAt(cols, ch.col);
    const to = k + 1 < chords.length ? idxAt(cols, chords[k + 1].col) : chars.length;
    segs.push({ chord: ch.name, text: chars.slice(from, Math.max(from, to)).join('') });
  });
  return segs;
}
function displayCol(s: string, idx: number): number {
  let c = 0;
  for (const ch of s.slice(0, idx)) c += colWidth(ch);
  return c;
}
function idxAt(cols: number[], col: number): number {
  for (let i = 0; i < cols.length; i++) if (cols[i] >= col) return i;
  return cols.length;
}

/** | C . G . | Am | % | */
function parseBars(line: string): string[][] {
  const parts = line.trim().replace(/^\|+|\|+$/g, '').split('|');
  const bars: string[][] = [];
  for (const p of parts) {
    const toks = p.trim().split(/\s+/).filter(Boolean);
    if (!toks.length) continue;
    if (toks.length === 1 && toks[0] === '%' && bars.length) bars.push([...bars[bars.length - 1]]);
    else bars.push(toks);
  }
  return bars;
}
const isBarsLine = (line: string) => /^\s*\|/.test(line) && !TAB_LABELED.test(line) && parseBars(line).every((b) => b.every((t) => t === '.' || t === '/' || t === '%' || isChordToken(t)));

export function parseSong(text: string): ParsedSong {
  const meta: SongMeta = { title: '', artist: '', key: '', capo: 0, tempo: 0, beats: 4, unit: 4, strum: '', finger: '', chordBeats: 0 };
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let inTab = false;
  let tabBuf: string[] = [];
  const flushTab = () => {
    if (!tabBuf.length) return;
    for (const g of splitTabGroups(tabBuf)) blocks.push(parseTab(g.lines, meta.beats, g.rhythm));
    tabBuf = [];
  };
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.replace(/\s+$/, '');
    const d = DIRECTIVE.exec(line.trim());
    if (d) {
      const key = d[1].toLowerCase(), val = (d[2] ?? '').trim();
      if (key === 'sot' || key === 'start_of_tab') { flushTab(); inTab = true; continue; }
      if (key === 'eot' || key === 'end_of_tab') { flushTab(); inTab = false; continue; }
      if (key === 't' || key === 'title') meta.title = val;
      else if (key === 'st' || key === 'subtitle' || key === 'artist' || key === 'a') meta.artist = val;
      else if (key === 'key' || key === 'k') meta.key = val;
      else if (key === 'capo') meta.capo = Math.max(0, Math.min(12, parseInt(val) || 0));
      else if (key === 'tempo' || key === 'bpm') meta.tempo = Math.max(30, Math.min(250, parseInt(val) || 0));
      else if (key === 'time') { const m = /(\d+)\s*\/\s*(\d+)/.exec(val); if (m) { meta.beats = +m[1]; meta.unit = +m[2]; } }
      else if (key === 'strum') meta.strum = val.replace(/\s+/g, '');
      else if (key === 'finger' || key === 'pattern') meta.finger = val;
      else if (key === 'chord_beats' || key === 'beats_per_chord') meta.chordBeats = Math.max(1, parseInt(val) || 0);
      else if (key === 'soc' || key === 'start_of_chorus') blocks.push({ kind: 'section', label: val || '후렴' });
      else if (key === 'sov' || key === 'start_of_verse') blocks.push({ kind: 'section', label: val || '절' });
      else if (key === 'sob' || key === 'start_of_bridge') blocks.push({ kind: 'section', label: val || '브리지' });
      else if (key === 'c' || key === 'comment' || key === 'ci' || key === 'comment_italic') blocks.push({ kind: 'comment', text: val });
      // eoc/eov 등은 무시
      continue;
    }
    // 탭 (6줄 묶음) — {sot} 없이도 알아봄
    const looksTab = TAB_LABELED.test(line) || (inTab && TAB_LINE.test(line) && line.includes('-'));
    if (looksTab) { tabBuf.push(line); continue; }
    if (RHYTHM_LINE.test(line) && /[|:]\s*[-whqest.\s|]+$/.test(line) && TAB_LABELED.test(lines[i + 1] ?? '')) { tabBuf.push(line); continue; }
    if (inTab && !line.trim()) { flushTab(); continue; }
    flushTab();
    if (!line.trim()) { if (blocks.length && blocks[blocks.length - 1].kind !== 'empty') blocks.push({ kind: 'empty' }); continue; }
    if (/^\s*\[?(intro|verse|chorus|bridge|outro|pre-?chorus|interlude|전주|간주|후주|후렴|절|\d절|브릿지|브리지)\b.*\]?\s*:?\s*$/i.test(line) && !isChordLine(line)) {
      blocks.push({ kind: 'section', label: line.trim().replace(/^\[|\]$|:$/g, '') });
      continue;
    }
    if (/^\s*M\s*[|:]/.test(line)) { blocks.push({ kind: 'melody', text: line.trim() }); continue; }
    if (isBarsLine(line)) { blocks.push({ kind: 'bars', bars: parseBars(line) }); continue; }
    if (line.includes('[') && /\[[^\]]+\]/.test(line)) { blocks.push({ kind: 'line', segs: parseInline(line) }); continue; }
    if (isChordLine(line)) {
      const next = lines[i + 1]?.replace(/\s+$/, '') ?? '';
      if (next.trim() && !isChordLine(next) && !DIRECTIVE.test(next.trim()) && !TAB_LABELED.test(next) && !isBarsLine(next)) {
        blocks.push({ kind: 'line', segs: mergeChordLyric(line, next) });
        i++;
      } else {
        const names = line.trim().split(/\s+/).map((t) => t.replace(/^\(|\)$/g, '')).filter(isChordToken);
        blocks.push({ kind: 'line', segs: names.map((c) => ({ chord: c, text: '' })) });
      }
      continue;
    }
    blocks.push({ kind: 'line', segs: [{ text: line }] });
  }
  flushTab();
  while (blocks.length && blocks[blocks.length - 1].kind === 'empty') blocks.pop();
  return { meta, blocks };
}

/** 탭 줄을 6줄씩 (리듬 줄은 다음 묶음에 붙임) */
function splitTabGroups(lines: string[]): { lines: string[]; rhythm?: string }[] {
  const out: { lines: string[]; rhythm?: string }[] = [];
  let cur: string[] = [];
  let rhythm: string | undefined;
  for (const l of lines) {
    if (RHYTHM_LINE.test(l)) { if (cur.length) { out.push({ lines: cur, rhythm }); cur = []; } rhythm = l; continue; }
    cur.push(l);
    if (cur.length === 6) { out.push({ lines: cur, rhythm }); cur = []; rhythm = undefined; }
  }
  if (cur.length) out.push({ lines: cur, rhythm });
  return out;
}

const DUR: Record<string, number> = { w: 4, h: 2, q: 1, e: 0.5, s: 0.25, t: 1 / 3 };
/** 리듬 줄 → 글자 위치마다 길이(박) */
export function parseRhythm(line: string): { col: number; dur: number }[] {
  const out: { col: number; dur: number }[] = [];
  const re = /([whqest])(\.?)/g;
  const start = line.search(/[|:]/) + 1;
  let m: RegExpExecArray | null;
  re.lastIndex = start;
  while ((m = re.exec(line))) out.push({ col: m.index, dur: DUR[m[1]] * (m[2] ? 1.5 : 1) });
  return out;
}

/** ASCII 탭 6줄 → 박 위치가 있는 음들. 위 줄 = 1번 줄 */
export function parseTab(lines: string[], beatsPerBar = 4, rhythm?: string): Block & { kind: 'tab' } {
  // 줄 이름 떼기
  const bodies = lines.map((l) => l.replace(/^\s*([eEBGDAbgda]|[1-6])?\s*(?=[|:\-])/, ''));
  const prefix = lines[0].length - bodies[0].length;
  const width = Math.max(...bodies.map((b) => b.length));
  const rows = bodies.map((b) => b.padEnd(width, '-'));
  const nStr = rows.length;
  // 마디 줄: 모든 줄에서 | 인 칸
  const bars: number[] = [];
  for (let c = 0; c < width; c++) if (rows.every((r) => r[c] === '|' || r[c] === ':')) bars.push(c);
  type Raw = { col: number; notes: TabNote[] };
  const raw: Raw[] = [];
  for (let r = 0; r < nStr; r++) {
    const row = rows[r];
    const string = 5 - r; // 첫 줄 = 1번 줄(배열 5)
    for (let c = 0; c < width; c++) {
      const ch = row[c];
      let note: TabNote | null = null, len = 1;
      if (/\d/.test(ch)) {
        len = /\d/.test(row[c + 1] ?? '') && +(ch + row[c + 1]) <= 24 ? 2 : 1;
        note = { string, fret: +row.slice(c, c + len) };
        const prev = row[c - 1];
        if (prev && /[hpb/\\~r]/.test(prev)) note.tech = prev;
      } else if (ch === 'x' || ch === 'X') {
        note = { string, fret: 0, dead: true };
      }
      if (!note) continue;
      // 레가토(h p / \)로 이어진 음도 따로 침으로 셈 (소리는 같음)
      let ev = raw.find((e) => Math.abs(e.col - c) <= 0);
      if (!ev) { ev = { col: c, notes: [] }; raw.push(ev); }
      if (!ev.notes.some((n) => n.string === string)) ev.notes.push(note);
      c += len - 1;
    }
  }
  raw.sort((a, b) => a.col - b.col);
  // 마디 나누기
  const edges = bars.length ? bars : [];
  const measures: { from: number; to: number }[] = [];
  let start = edges.length && edges[0] <= 1 ? edges[0] + 1 : 0;
  for (const b of edges) { if (b > start) measures.push({ from: start, to: b }); start = b + 1; }
  if (start < width && raw.some((e) => e.col >= start)) measures.push({ from: start, to: width });
  if (!measures.length) measures.push({ from: 0, to: width });
  const events: TabEvent[] = [];
  const gaps: number[] = [];
  for (let i = 1; i < raw.length; i++) gaps.push(raw[i].col - raw[i - 1].col);
  const medGap = gaps.length ? gaps.sort((a, b) => a - b)[gaps.length >> 1] : 2;
  const hasBars = bars.length > 0;
  measures.forEach((m, mi) => {
    const evs = raw.filter((e) => e.col >= m.from && e.col < m.to);
    if (!evs.length) return;
    if (!hasBars) {
      // 마디 줄이 없으면 칸 간격 하나 = 8분음표
      const first = evs[0].col;
      for (const e of evs) events.push({ beat: quant(((e.col - first) / medGap) * 0.5), notes: e.notes, col: prefix + e.col });
      return;
    }
    const inner = evs.map((e) => e.col - m.from);
    const first = inner[0];
    const ig: number[] = [];
    for (let i = 1; i < inner.length; i++) ig.push(inner[i] - inner[i - 1]);
    const g = ig.length ? ig.slice().sort((a, b) => a - b)[ig.length >> 1] : m.to - m.from - first;
    // 칸 간격 g 를 한 칸으로 보고, 마디 폭에 들어가는 칸 수를 흔한 값(8분 8칸, 16분 16칸 …)으로 맞춤
    const W = m.to - m.from;
    const counts = [2, 3, 4, 6, 8, 9, 12, 16, 24, 32];
    const offset = Math.max(0, Math.round((first - g / 2) / g));
    const idx = inner.map((p) => offset + Math.round((p - first) / g));
    let c = counts.reduce((best, k) => (Math.abs(Math.log(k / (W / g))) < Math.abs(Math.log(best / (W / g))) ? k : best), 8);
    while (c < idx[idx.length - 1] + 1) c = counts.find((k) => k > c) ?? c * 2;
    for (let i = 0; i < evs.length; i++) events.push({ beat: mi * beatsPerBar + quant((idx[i] * beatsPerBar) / c), notes: evs[i].notes, col: prefix + evs[i].col });
  });
  // 리듬 줄이 있으면 그 길이대로 (글자 위치 ±1 칸의 음에)
  if (rhythm) {
    const toks = parseRhythm(rhythm);
    if (toks.length) {
      let t = 0, dur = toks[0].dur;
      const sorted = events.slice().sort((a, b) => a.col - b.col);
      for (const e of sorted) {
        const tok = toks.find((k) => Math.abs(k.col - e.col) <= 1);
        if (tok) dur = tok.dur;
        e.beat = Math.round(t * 1000) / 1000;
        t += dur;
      }
      events.sort((a, b) => a.beat - b.beat);
      return { kind: 'tab', lines, events, beats: Math.max(1, Math.ceil(t / beatsPerBar - 1e-6)) * beatsPerBar, rhythm };
    }
  }
  const total = hasBars ? measures.length * beatsPerBar : Math.ceil(((events.at(-1)?.beat ?? 0) + 1) / beatsPerBar) * beatsPerBar;
  return { kind: 'tab', lines, events, beats: total };
}

/** 16분 또는 셋잇단 8분 격자 중 가까운 쪽 */
function quant(b: number): number {
  const q16 = Math.round(b * 4) / 4;
  const q3 = Math.round(b * 3) / 3;
  return Math.abs(q3 - b) + 0.02 < Math.abs(q16 - b) ? q3 : q16;
}
