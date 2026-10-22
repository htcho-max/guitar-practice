import { durToken } from '../fingerstyle/melody';

/**
 * MusicXML 리드시트(멜로디 + 코드 이름) → 내 곡 글 (마디 줄 + M| 멜로디 줄).
 * 첫 파트, 첫 성부만. 화음으로 겹친 음은 가장 높은 음. 도돌이표는 펼치지 않음.
 */
const STEP: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const KIND: Record<string, string> = {
  major: '', minor: 'm', augmented: 'aug', diminished: 'dim', dominant: '7', 'major-seventh': 'maj7', 'minor-seventh': 'm7',
  'diminished-seventh': 'dim7', 'augmented-seventh': '7', 'half-diminished': 'm7b5', 'major-minor': 'm', 'major-sixth': '6',
  'minor-sixth': 'm6', 'dominant-ninth': '9', 'major-ninth': 'maj9', 'minor-ninth': 'm9', 'dominant-11th': '11', 'dominant-13th': '13',
  'suspended-second': 'sus2', 'suspended-fourth': 'sus4', power: '5', none: '',
};

const txt = (el: Element | null | undefined, sel: string) => el?.querySelector(sel)?.textContent?.trim() ?? '';
const pitchName = (step: string, alter: number, flats: boolean) => ((flats || alter < 0 ? FLAT : SHARP)[(STEP[step] + alter + 12) % 12]);

export interface XmlResult { text: string; bars: number; notes: number; chords: number; warnings: string[] }

export function musicXmlToSong(xml: string, Parser: { new (): DOMParser } = DOMParser): XmlResult {
  const doc = new Parser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('MusicXML 을 읽을 수 없어요.');
  const warnings: string[] = [];
  const title = txt(doc.documentElement, 'work > work-title') || txt(doc.documentElement, 'movement-title') || '악보에서 불러온 곡';
  const composer = [...doc.querySelectorAll('identification > creator')].map((c) => c.textContent?.trim()).filter(Boolean).join(', ');
  const part = doc.querySelector('part');
  if (!part) throw new Error('파트가 없어요.');
  let divisions = 1, beats = 4, beatType = 4, fifths = 0, tempo = 0;
  type N = { midi: number | null; dur: number; tie: boolean };
  type Bar = { len: number; notes: N[]; harm: { at: number; name: string }[] };
  const bars: Bar[] = [];
  let prevChord = '';
  part.querySelectorAll(':scope > measure').forEach((m, mi) => {
    const bar: Bar = { len: 0, notes: [], harm: [] };
    let cur = 0;
    let lastNote: N | null = null;
    for (const el of Array.from(m.children)) {
      const tag = el.tagName;
      if (tag === 'attributes') {
        const d = txt(el, 'divisions'); if (d) divisions = Number(d);
        const b = txt(el, 'time > beats'); if (b) beats = Number(b);
        const bt = txt(el, 'time > beat-type'); if (bt) beatType = Number(bt);
        const f = txt(el, 'key > fifths'); if (f) fifths = Number(f);
      } else if (tag === 'direction') {
        const t = el.querySelector('sound')?.getAttribute('tempo');
        if (t && !tempo) tempo = Math.round(Number(t));
      } else if (tag === 'sound' && el.getAttribute('tempo') && !tempo) {
        tempo = Math.round(Number(el.getAttribute('tempo')));
      } else if (tag === 'harmony') {
        const step = txt(el, 'root > root-step');
        if (!step) continue;
        const alter = Number(txt(el, 'root > root-alter') || 0);
        const kindEl = el.querySelector('kind');
        const kindText = kindEl?.getAttribute('text');
        const kind = kindText != null && kindText !== '' ? kindText : KIND[kindEl?.textContent?.trim() ?? 'major'] ?? '';
        const bs = txt(el, 'bass > bass-step');
        const bass = bs ? '/' + pitchName(bs, Number(txt(el, 'bass > bass-alter') || 0), fifths < 0) : '';
        const off = Number(txt(el, 'offset') || 0);
        bar.harm.push({ at: (cur + off) / divisions, name: pitchName(step, alter, fifths < 0) + kind + bass });
      } else if (tag === 'backup') {
        cur -= Number(txt(el, 'duration') || 0);
      } else if (tag === 'forward') {
        cur += Number(txt(el, 'duration') || 0);
      } else if (tag === 'note') {
        if (el.querySelector('grace')) continue;
        const voice = txt(el, 'voice');
        const staff = txt(el, 'staff');
        if ((voice && voice !== '1') || (staff && staff !== '1')) { if (!el.querySelector('chord')) cur += Number(txt(el, 'duration') || 0); continue; }
        const dur = Number(txt(el, 'duration') || 0);
        const isChord = !!el.querySelector('chord');
        const rest = !!el.querySelector('rest');
        let midi: number | null = null;
        if (!rest) {
          const step = txt(el, 'pitch > step'), oct = Number(txt(el, 'pitch > octave'));
          midi = (oct + 1) * 12 + STEP[step] + Number(txt(el, 'pitch > alter') || 0);
        }
        if (isChord) { if (lastNote && midi !== null && (lastNote.midi ?? -1) < midi) lastNote.midi = midi; continue; }
        const tie = [...el.querySelectorAll('tie')].some((t) => t.getAttribute('type') === 'start');
        lastNote = { midi, dur: dur / divisions, tie };
        bar.notes.push(lastNote);
        cur += dur;
      }
    }
    const q = beats * (4 / beatType);
    bar.len = q;
    const used = bar.notes.reduce((a, n) => a + n.dur, 0);
    // 못갖춘마디: 앞을 쉼으로 채움
    if (used < q - 1e-6) {
      if (mi === 0 || m.getAttribute('implicit') === 'yes') bar.notes.unshift({ midi: null, dur: q - used, tie: false });
      else bar.notes.push({ midi: null, dur: q - used, tie: false });
      if (mi === 0) bar.harm.forEach((h) => { h.at += q - used; });
    }
    if (!bar.harm.length && prevChord) bar.harm.push({ at: 0, name: prevChord });
    if (bar.harm.length) prevChord = bar.harm[bar.harm.length - 1].name;
    bars.push(bar);
  });
  if (beatType === 8) warnings.push('8분 박자표는 4분음표 박으로 바꿔 적었어요');
  if (part.querySelector('repeat, ending')) warnings.push('도돌이표는 펼치지 않았어요 — 필요하면 마디를 복사해 넣으세요');
  const firstChord = bars.find((b) => b.harm.length)?.harm[0].name ?? 'C';

  // 길이 → 멜로디 글자 (못 쓰는 길이는 붙임줄로 나눔)
  const split = (d: number): string[] => {
    const out: string[] = [];
    let left = Math.round(d * 1000) / 1000;
    const parts = [4, 3, 2, 1.5, 1, 0.75, 2 / 3, 0.5, 1 / 3, 0.25];
    while (left > 1e-3) {
      const p = parts.find((x) => x <= left + 1e-3);
      if (!p) break;
      out.push(durToken(p)!);
      left = Math.round((left - p) * 1000) / 1000;
    }
    return out;
  };
  const nm = (m: number) => `${NAMES[m % 12]}${Math.floor(m / 12) - 1}`;
  const lines: string[] = [];
  const perLine = 4;
  let noteCount = 0;
  for (let i = 0; i < bars.length; i += perLine) {
    const group = bars.slice(i, i + perLine);
    const chordLine = '| ' + group.map((b) => {
      const n = Math.max(1, Math.round(b.len));
      const toks: string[] = [];
      let last = '';
      for (let k = 0; k < n; k++) {
        const h = [...b.harm].reverse().find((x) => x.at <= k + 0.25);
        const name = h?.name ?? (k === 0 ? prevOf(bars, i, firstChord) : last);
        toks.push(k > 0 && name === last ? '.' : name);
        last = name;
      }
      return toks.every((t, k) => k === 0 || t === '.') ? toks[0] : toks.join(' ');
    }).join(' | ') + ' |';
    const melLine = 'M| ' + group.map((b) => b.notes.map((n, k) => {
      noteCount += n.midi !== null ? 1 : 0;
      const parts = split(n.dur);
      const tieNext = n.tie && k < b.notes.length;
      return parts.map((p, j) => (n.midi === null ? 'r' : nm(n.midi)) + p + (n.midi !== null && (j < parts.length - 1 || tieNext) ? '~' : '')).join(' ');
    }).join(' ')).join(' | ');
    lines.push(chordLine, melLine);
  }
  const head = [`{title: ${title}}`];
  if (composer) head.push(`{artist: ${composer}}`);
  head.push(`{time: ${beatType === 8 ? Math.round(beats / 2) : beats}/4}`);
  if (tempo) head.push(`{tempo: ${tempo}}`);
  head.push('{c: MusicXML 에서 불러옴 — "핑거스타일로 편곡" 을 눌러 보세요}', '');
  return { text: [...head, ...lines].join('\n'), bars: bars.length, notes: noteCount, chords: bars.reduce((a, b) => a + b.harm.length, 0), warnings };
}

function prevOf(bars: { harm: { name: string }[] }[], i: number, fallback: string): string {
  for (let k = i - 1; k >= 0; k--) if (bars[k].harm.length) return bars[k].harm[bars[k].harm.length - 1].name;
  return fallback;
}
