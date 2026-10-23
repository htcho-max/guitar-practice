import type { MelNote } from '../fingerstyle/melody';
import { parseMelody } from '../fingerstyle/melody';

/**
 * 멜로디만 있는 곡에 코드 붙이기.
 * 1) 조 찾기 (음 길이 가중 + 크룸한슬 프로필, 조표가 있으면 그 조와 나란한조 중에서)
 * 2) 반 마디(4/4·6/8) 또는 한 마디 칸마다 그 조의 코드 후보 점수 (센박·긴 음이 코드 음이면 +, 아니면 −)
 * 3) 비터비로 진행 고르기 (자연스러운 진행 +, 마디 가운데서 바뀌면 −, 첫·끝은 으뜸화음, 끝 앞은 딸림)
 */
export type HarmStyle = 'basic' | 'seventh';
export type HarmDensity = 'bar' | 'auto';
export interface HarmOpts { beatsPerBar: number; style?: HarmStyle; density?: HarmDensity; /** 다채롭게: vi·ii·iii 를 더 쓰고 같은 코드를 오래 끌지 않음 */ color?: boolean; /** MusicXML 조표 (#=+, b=−) */ fifths?: number }
export interface HarmSpan { beat: number; dur: number; name: string }
export interface HarmResult { spans: HarmSpan[]; key: { tonic: number; minor: boolean; name: string } }

const MAJ_P = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN_P = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
/** 조 이름 표기용 (반음 → 이름, 조에 따라 #/b) */
const FLAT_KEYS = new Set([5, 10, 3, 8, 1, 6]); // F Bb Eb Ab Db Gb (장조 기준)

function corr(a: number[], b: number[]) {
  const ma = a.reduce((s, x) => s + x, 0) / 12, mb = b.reduce((s, x) => s + x, 0) / 12;
  let n = 0, da = 0, db = 0;
  for (let i = 0; i < 12; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; }
  return da && db ? n / Math.sqrt(da * db) : 0;
}

export function detectKey(notes: MelNote[], fifths?: number): { tonic: number; minor: boolean } {
  const w = new Array(12).fill(0);
  for (const n of notes) if (n.midi !== null) w[n.midi % 12] += Math.min(n.dur, 2);
  const last = [...notes].reverse().find((n) => n.midi !== null)?.midi;
  const cands: { tonic: number; minor: boolean }[] = [];
  if (fifths !== undefined) { const maj = ((fifths * 7) % 12 + 12) % 12; cands.push({ tonic: maj, minor: false }, { tonic: (maj + 9) % 12, minor: true }); }
  else for (let t = 0; t < 12; t++) cands.push({ tonic: t, minor: false }, { tonic: t, minor: true });
  let best = cands[0], bs = -Infinity;
  for (const c of cands) {
    const prof = (c.minor ? MIN_P : MAJ_P).map((_, i) => (c.minor ? MIN_P : MAJ_P)[(i - c.tonic + 12) % 12]);
    // 끝 음이 으뜸음이면 더 그럴듯 (장조를 조금 더 흔하게 봄)
    const s = corr(w, prof) + (last != null && last % 12 === c.tonic ? 0.3 : 0) + (c.minor ? -0.08 : 0);
    if (s > bs) { bs = s; best = c; }
  }
  return best;
}

interface Cand { deg: string; root: number; pcs: number[]; seventh?: number; suffix: string; prior: number }

/** 그 조에서 쓸 코드 후보 (도수 이름은 진행 점수용) */
function candidates(tonic: number, minor: boolean, style: HarmStyle): Cand[] {
  const mk = (deg: string, semi: number, q: 'M' | 'm' | 'd' | '7' | 'M7' | 'm7', prior: number): Cand => {
    const root = (tonic + semi) % 12;
    const iv = q === 'M' ? [0, 4, 7] : q === 'm' ? [0, 3, 7] : q === 'd' ? [0, 3, 6] : q === '7' ? [0, 4, 7, 10] : q === 'M7' ? [0, 4, 7, 11] : [0, 3, 7, 10];
    const pcs = iv.slice(0, 3).map((x) => (root + x) % 12);
    return { deg, root, pcs, seventh: iv[3] !== undefined ? (root + iv[3]) % 12 : undefined, suffix: { M: '', m: 'm', d: 'dim', '7': '7', M7: 'maj7', m7: 'm7' }[q], prior };
  };
  const sev = style === 'seventh';
  if (!minor) return [
    mk('I', 0, sev ? 'M7' : 'M', 0.9), mk('ii', 2, sev ? 'm7' : 'm', 0.15), mk('iii', 4, sev ? 'm7' : 'm', -0.25), mk('IV', 5, sev ? 'M7' : 'M', 0.6),
    mk('V', 7, 'M', 0.6), mk('V7', 7, '7', sev ? 0.55 : 0.35), mk('vi', 9, sev ? 'm7' : 'm', 0.3),
    mk('V/V', 2, '7', -0.9), mk('V/vi', 4, '7', -1.0), mk('V/IV', 0, '7', -1.2),
  ];
  return [
    mk('i', 0, sev ? 'm7' : 'm', 0.9), mk('iv', 5, sev ? 'm7' : 'm', 0.5), mk('v', 7, 'm', -0.1), mk('V', 7, 'M', 0.6), mk('V7', 7, '7', 0.5),
    mk('VI', 8, sev ? 'M7' : 'M', 0.35), mk('VII', 10, 'M', 0.3), mk('III', 3, sev ? 'M7' : 'M', 0.25), mk('ii°', 2, 'd', -0.7),
  ];
}

/** 진행 점수 (앞 → 뒤 도수) */
const GOOD: Record<string, string[]> = {
  I: ['IV', 'V', 'V7', 'vi', 'ii', 'iii', 'V/V', 'V/vi', 'V/IV'], ii: ['V', 'V7', 'IV'], iii: ['vi', 'IV', 'V/vi'], IV: ['V', 'V7', 'I', 'ii'],
  V: ['I', 'vi'], V7: ['I', 'vi'], vi: ['ii', 'IV', 'V', 'iii'], 'V/V': ['V', 'V7'], 'V/vi': ['vi'], 'V/IV': ['IV'],
  i: ['iv', 'V', 'V7', 'VI', 'VII', 'III', 'v'], iv: ['V', 'V7', 'i', 'VII'], v: ['VI', 'iv', 'i'], VI: ['iv', 'VII', 'V', 'III', 'ii°'],
  VII: ['III', 'i', 'VI'], III: ['VI', 'iv', 'VII'], 'ii°': ['V', 'V7'],
};
const BAD: Record<string, string[]> = { V: ['IV', 'ii'], V7: ['IV', 'ii', 'iii'], 'V/V': ['I', 'IV'], 'V/vi': ['I', 'IV'] };
function trans(a: string, b: string): number {
  if (a === b) return 0;
  if (GOOD[a]?.includes(b)) return 0.3;
  if (BAD[a]?.includes(b)) return -0.5;
  return -0.05;
}

export function harmonize(notes: MelNote[], o: HarmOpts): HarmResult {
  const bpb = o.beatsPerBar;
  const total = notes.reduce((t, n) => Math.max(t, n.beat + n.dur), 0);
  const bars = Math.max(1, Math.ceil(total / bpb - 1e-6));
  const key = detectKey(notes, o.fifths);
  const flats = !key.minor ? FLAT_KEYS.has(key.tonic) : FLAT_KEYS.has((key.tonic + 3) % 12);
  const nm = (pc: number) => (flats ? FLAT : SHARP)[pc];
  // 점수는 3화음으로 (7화음 후보는 음을 많이 덮어서 잘못 고르기 쉬움), 7화음은 고른 뒤에 덧붙임
  const cands = candidates(key.tonic, key.minor, 'basic');
  if (o.color) for (const c of cands) { if (c.deg === 'vi' || c.deg === 'VI') c.prior += 0.25; if (c.deg === 'ii' || c.deg === 'iv') c.prior += 0.2; if (c.deg === 'iii' || c.deg === 'III') c.prior += 0.2; if (c.deg === 'I' || c.deg === 'i') c.prior -= 0.15; }
  const SEV: Record<string, string> = { I: 'maj7', ii: 'm7', iii: 'm7', IV: 'maj7', V: '7', vi: 'm7', i: 'm7', iv: 'm7', VI: 'maj7', III: 'maj7' };
  const half = o.density !== 'bar' && (bpb === 4 || bpb === 6);
  const slotLen = half ? bpb / 2 : bpb;
  const nSlots = Math.round((bars * bpb) / slotLen);
  const strong = (b: number) => Math.abs(b % bpb) < 1e-6 ? 1.6 : (bpb === 4 && Math.abs((b % bpb) - 2) < 1e-6) || (bpb === 6 && Math.abs((b % bpb) - 3) < 1e-6) ? 1.3 : Math.abs(b - Math.round(b)) < 1e-6 ? 1.0 : 0.6;
  // 칸마다 후보 점수
  const lastNoteSlot = Math.floor(([...notes].reverse().find((n) => n.midi !== null)?.beat ?? 0) / slotLen + 1e-6);
  const local: number[][] = [];
  const empty: boolean[] = [];
  for (let s = 0; s < nSlots; s++) {
    const a = s * slotLen, b = a + slotLen;
    const inSlot = notes.filter((n) => n.midi !== null && n.beat < b - 1e-6 && n.beat + n.dur > a + 1e-6);
    empty.push(!inSlot.length);
    local.push(cands.map((c) => {
      let sc = 0, tot = 0;
      for (const n of inSlot) {
        const ov = Math.min(b, n.beat + n.dur) - Math.max(a, n.beat);
        const starts = n.beat >= a - 1e-6;
        let w = Math.min(ov, 2) * (starts ? strong(n.beat) : 1.1);
        if (!starts) w *= 1.2; // 앞에서 이어진 음은 칸 첫 박에 울림
        const pc = n.midi! % 12;
        const i = c.pcs.indexOf(pc);
        const passing = ov <= 0.5 && starts && strong(n.beat) < 1;
        if (passing) w *= 0.5;
        tot += w;
        if (i >= 0) sc += w * [1.1, 1.0, 0.85][i];
        else if (c.seventh === pc) sc += w * 0.4;
        else sc -= w * (passing ? 0.3 : 1.0);
      }
      return (tot ? (2 * sc) / tot : 0) + c.prior;
    }));
  }
  // 비터비 (상태 = 코드 × 같은 코드로 넘은 마디 줄 수 0~3)
  const N = cands.length, R = 4;
  const isTonic = (c: Cand) => c.deg === 'I' || c.deg === 'i';
  const isDom = (c: Cand) => c.deg === 'V' || c.deg === 'V7';
  const holdPen = o.color ? 0.45 : 0.12;
  const st = (k: number, r: number) => k * R + r;
  let dp = new Array(N * R).fill(-Infinity);
  // 첫 칸: 으뜸화음 쪽으로 (못갖춘마디처럼 음이 조금뿐이면 더)
  const firstCover = notes.filter((n) => n.midi !== null && n.beat < slotLen - 1e-6).reduce((t, n) => t + Math.min(n.dur, slotLen - n.beat), 0) / slotLen;
  cands.forEach((c, k) => { dp[st(k, 0)] = local[0][k] + (isTonic(c) ? (firstCover < 0.5 ? 1.5 : 0.5) : 0); });
  const back: number[][] = [];
  for (let s = 1; s < nSlots; s++) {
    const mid = half && s % 2 === 1; // 마디 가운데
    const nd = new Array(N * R).fill(-Infinity), bk = new Array(N * R).fill(0);
    for (let k = 0; k < N; k++) {
      let ex = local[s][k];
      if (s === lastNoteSlot || s === nSlots - 1) ex += isTonic(cands[k]) ? 1.2 : -0.6;
      if ((s === lastNoteSlot - 1 || (half && s === lastNoteSlot - 2)) && isDom(cands[k])) ex += 0.35;
      for (let j = 0; j < N; j++) for (let r = 0; r < R; r++) {
        const from = dp[st(j, r)];
        if (from === -Infinity) continue;
        let t = from + ex, nr = 0;
        if (j === k) {
          t += mid ? 0.6 : 0.15; // 그대로 가면 덜 바쁨
          nr = mid ? r : Math.min(R - 1, r + 1);
          if (!mid && nr >= 2 && !empty[s]) t -= holdPen * (nr - 1);
        } else {
          t += trans(cands[j].deg, cands[k].deg) - (mid ? 0.8 : 0);
          if (empty[s]) t -= 0.8; // 음 없는 칸은 앞 코드 유지
        }
        if (t > nd[st(k, nr)]) { nd[st(k, nr)] = t; bk[st(k, nr)] = st(j, r); }
      }
    }
    dp = nd; back.push(bk);
  }
  let k = dp.indexOf(Math.max(...dp));
  const pick: number[] = new Array(nSlots);
  for (let s = nSlots - 1; s >= 0; s--) { pick[s] = Math.floor(k / R); if (s > 0) k = back[s - 1][k]; }
  const spans: HarmSpan[] = [];
  pick.forEach((ci, s) => {
    const c = cands[ci];
    const name = nm(c.root) + (o.style === 'seventh' && SEV[c.deg] ? SEV[c.deg] : c.suffix);
    const prev = spans[spans.length - 1];
    if (prev && prev.name === name) prev.dur += slotLen;
    else spans.push({ beat: s * slotLen, dur: slotLen, name });
  });
  return { spans, key: { ...key, name: nm(key.tonic) + (key.minor ? 'm' : '') } };
}

/** 코드 구간 → 마디 줄 글 ("| G . D . | Em |") */
export function barsLine(spans: HarmSpan[], from: number, to: number, bpb: number): string {
  const out: string[] = [];
  for (let m = from; m < to - 1e-6; m += bpb) {
    const toks: string[] = [];
    let last = '';
    for (let b = 0; b < bpb; b++) {
      const sp = spans.find((x) => m + b >= x.beat - 1e-6 && m + b < x.beat + x.dur - 1e-6) ?? spans[spans.length - 1];
      const name = sp?.name ?? 'C';
      toks.push(b > 0 && name === last ? '.' : name);
      last = name;
    }
    out.push(toks.every((t, i) => i === 0 || t === '.') ? toks[0] : toks.join(' '));
  }
  return '| ' + out.join(' | ') + ' |';
}

/**
 * 곡 글의 M| 줄마다 바로 위에 코드 마디 줄을 넣음 (이미 마디 줄이 있으면 replace=true 일 때만 바꿈).
 * M| 줄은 마디 처음에서 시작한다고 봄.
 */
export function addChordsToSongText(text: string, bpb: number, o: { style?: HarmStyle; density?: HarmDensity; color?: boolean; replace?: boolean } = {}): { text: string; key: string; chords: number } | null {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const melIdx = lines.map((l, i) => (/^\s*M\s*[|:]/.test(l) ? i : -1)).filter((i) => i >= 0);
  if (!melIdx.length) return null;
  const ranges: { i: number; from: number; to: number }[] = [];
  const all: MelNote[] = [];
  let t = 0;
  for (const i of melIdx) {
    const m = parseMelody(lines[i]);
    m.notes.forEach((n) => all.push({ ...n, beat: n.beat + t }));
    const len = Math.ceil(m.beats / bpb - 1e-6) * bpb;
    ranges.push({ i, from: t, to: t + len });
    t += len;
  }
  // 붙임줄이 줄을 넘는 것은 그냥 두 음으로 (코드 고르기에는 영향 적음)
  const r = harmonize(all, { beatsPerBar: bpb, style: o.style, density: o.density, color: o.color });
  const isBars = isBarsLine;
  // 뒤에서부터 넣어야 줄 번호가 안 밀림
  for (const g of [...ranges].reverse()) {
    const line = barsLine(r.spans, g.from, g.to, bpb);
    const prev = g.i - 1;
    if (prev >= 0 && isBars(lines[prev])) { if (o.replace) lines[prev] = line; }
    else lines.splice(g.i, 0, line);
  }
  return { text: lines.join('\n'), key: r.key.name, chords: r.spans.length };
}

const isBarsLine = (l: string) => /^\s*\|.*\|\s*$/.test(l) && !/^\s*[A-Za-z]\s*\|/.test(l);
/** M| 줄 수와 그 바로 위에 마디 코드 줄이 있는 수 (다시 붙이기 가능한지) */
export function melodyChordState(text: string): { mel: number; withBars: number } {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  let mel = 0, withBars = 0;
  lines.forEach((l, i) => { if (/^\s*M\s*[|:]/.test(l)) { mel++; if (i > 0 && isBarsLine(lines[i - 1])) withBars++; } });
  return { mel, withBars };
}
