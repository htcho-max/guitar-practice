// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { TUNES, tuneById } from '../src/fingerstyle/tunes';
import { parseMelody } from '../src/fingerstyle/melody';
import { chordSpans } from '../src/fingerstyle/arrange';
import { harmonize, detectKey, addChordsToSongText, melodyChordState } from '../src/song/harmonize';
import { musicXmlToSong } from '../src/song/musicxml';
import { parseSong } from '../src/song/parse';
import { buildTimeline } from '../src/song/timeline';

const at = (sp: { beat: number; dur: number; name: string }[], b: number) => sp.find((x) => b >= x.beat - 1e-6 && b < x.beat + x.dur - 1e-6)?.name ?? '';
const root = (n: string) => n.replace(/(maj7|m7|m|7|dim).*$/, '');
function agree(id: string) {
  const t = tuneById(id);
  const mel = parseMelody(t.melody);
  const r = harmonize(mel.notes, { beatsPerBar: t.beats });
  const real = chordSpans(t.chords, t.beats);
  let same = 0;
  for (let b = 0; b < mel.beats; b++) if (root(at(r.spans, b)) === root(at(real, b))) same++;
  return { rate: same / mel.beats, r };
}

describe('멜로디로 코드 붙이기', () => {
  it('조 찾기', () => {
    expect(TUNES.map((t) => { const k = detectKey(parseMelody(t.melody).notes); return (k.minor ? 'm' : 'M') + k.tonic; })).toEqual(['M0', 'M7', 'M7', 'M2', 'm9']);
    expect(detectKey(parseMelody(tuneById('greensleeves').melody).notes, 0)).toEqual({ tonic: 9, minor: true });
  });
  it('연습곡의 원래 코드와 대부분 같음', () => {
    expect(agree('twinkle').rate).toBe(1);
    expect(agree('jingle').rate).toBeGreaterThan(0.85);
    expect(agree('greensleeves').rate).toBeGreaterThan(0.6);
    expect(agree('amazing').rate).toBeGreaterThan(0.6);
  });
  it('끝은 으뜸화음, 7화음 모양', () => {
    const { r } = agree('ode');
    expect(r.spans.at(-1)!.name).toBe('G');
    const s7 = harmonize(parseMelody(tuneById('twinkle').melody).notes, { beatsPerBar: 4, style: 'seventh' });
    expect(s7.spans[0].name).toBe('Cmaj7');
    expect(s7.spans.some((s) => s.name === 'G7')).toBe(true);
    const bar = harmonize(parseMelody(tuneById('twinkle').melody).notes, { beatsPerBar: 4, density: 'bar' });
    expect(bar.spans.every((s) => s.beat % 4 === 0)).toBe(true);
  });
  it('곡 글에 마디 줄 넣기 / 다시 붙이기', () => {
    const txt = '{title: t}\n{time: 3/4}\n\nM| rh D4q | G4h B4e G4e | B4h A4q | G4h E4q | D4h D4q\nM| G4h B4e G4e | B4h A4q | D4h E4q | G4h.';
    expect(melodyChordState(txt)).toEqual({ mel: 2, withBars: 0 });
    const r = addChordsToSongText(txt, 3)!;
    expect(r.key).toBe('G');
    const st = melodyChordState(r.text);
    expect(st).toEqual({ mel: 2, withBars: 2 });
    const tl = buildTimeline(parseSong(r.text));
    expect(tl.beats).toBe(27);
    // 다시 붙여도 줄이 늘지 않음
    const again = addChordsToSongText(r.text, 3, { style: 'seventh', replace: true })!;
    expect(again.text.split('\n').length).toBe(r.text.split('\n').length);
    expect(again.text).toMatch(/Gmaj7/);
  });
  it('코드 없는 MusicXML → 코드 자동', () => {
    const n = (s: string, o: number, d: number) => `<note><pitch><step>${s}</step><octave>${o}</octave></pitch><duration>${d}</duration><voice>1</voice></note>`;
    const xml = `<score-partwise><part-list><score-part id="P1"/></part-list><part id="P1">
<measure number="1"><attributes><divisions>1</divisions><key><fifths>0</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>${n('C', 4, 1)}${n('C', 4, 1)}${n('G', 4, 1)}${n('G', 4, 1)}</measure>
<measure number="2">${n('A', 4, 1)}${n('A', 4, 1)}${n('G', 4, 2)}</measure>
<measure number="3">${n('F', 4, 1)}${n('F', 4, 1)}${n('E', 4, 1)}${n('E', 4, 1)}</measure>
<measure number="4">${n('D', 4, 1)}${n('D', 4, 1)}${n('C', 4, 2)}</measure></part></score-partwise>`;
    const r = musicXmlToSong(xml);
    expect(r.autoKey).toBe('C');
    expect(r.warnings[0]).toMatch(/멜로디로 코드/);
    const chords = buildTimeline(parseSong(r.text)).items.filter((i) => i.kind === 'chord').map((i) => (i as { chord: string }).chord);
    expect(chords).toEqual(['C', 'F', 'C', 'F', 'C', 'G', 'C']);
  });
});
