// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { musicXmlToSong } from '../src/song/musicxml';
import { parseSong } from '../src/song/parse';
import { buildTimeline } from '../src/song/timeline';
import { parseMelody } from '../src/fingerstyle/melody';
import { arrange } from '../src/fingerstyle/arrange';

const note = (step: string, oct: number, dur: number, extra = '') => `<note><pitch><step>${step}</step>${extra}<octave>${oct}</octave></pitch><duration>${dur}</duration><voice>1</voice></note>`;
const XML = `<?xml version="1.0"?><score-partwise><work><work-title>시험 리드시트</work-title></work>
<identification><creator type="composer">작곡가</creator></identification>
<part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>
<part id="P1">
<measure number="0" implicit="yes"><attributes><divisions>2</divisions><key><fifths>2</fifths></key><time><beats>4</beats><beat-type>4</beat-type></time></attributes>
<direction><sound tempo="72"/></direction>
${note('B', 3, 1)}${note('F', 4, 1, '<alter>1</alter>')}</measure>
<measure number="1"><harmony><root><root-step>G</root-step></root><kind text="M7">major-seventh</kind></harmony>
${note('F', 4, 1, '<alter>1</alter>')}${note('F', 4, 1, '<alter>1</alter>')}${note('F', 4, 1, '<alter>1</alter>')}${note('E', 4, 1)}${note('F', 4, 2, '<alter>1</alter>')}<note><rest/><duration>2</duration><voice>1</voice></note></measure>
<measure number="2"><harmony><root><root-step>F</root-step><root-alter>1</root-alter></root><kind>minor-seventh</kind></harmony>
${note('E', 4, 2)}<note><chord/><pitch><step>A</step><octave>4</octave></pitch><duration>2</duration><voice>1</voice></note>
<harmony><root><root-step>B</root-step></root><kind>minor</kind></harmony>
<note><pitch><step>D</step><octave>4</octave></pitch><duration>3</duration><voice>1</voice><tie type="start"/></note><note><pitch><step>D</step><octave>4</octave></pitch><duration>3</duration><voice>1</voice><tie type="stop"/></note>
<harmony><root><root-step>D</root-step></root><kind>major</kind><bass><bass-step>F</bass-step><bass-alter>1</bass-alter></bass></harmony>
</measure>
</part></score-partwise>`;

describe('MusicXML 리드시트 불러오기', () => {
  it('못갖춘마디·코드 이름·붙임줄·화음 맨 위 음', () => {
    const r = musicXmlToSong(XML);
    expect(r.warnings).toEqual([]);
    expect(r.text).toContain('{title: 시험 리드시트}');
    expect(r.text).toContain('{tempo: 72}');
    const s = parseSong(r.text);
    const tl = buildTimeline(s);
    expect(tl.beats).toBe(12);
    const chords = tl.items.filter((i) => i.kind === 'chord').map((i) => (i as { chord: string }).chord);
    expect(chords).toEqual(['GM7', 'GM7', 'F#m7', 'Bm']);
    const mel = parseMelody(s.blocks.filter((b) => b.kind === 'melody').map((b) => (b as { text: string }).text).join(' '));
    expect(mel.errors).toEqual([]);
    expect(mel.beats).toBe(12);
    // 3박 쉼 + B3 F#4, … , E4 화음 → A4 (맨 위), D4 3박 붙임줄
    expect(mel.notes.map((n) => n.midi)).toEqual([null, 59, 66, 66, 66, 66, 64, 66, null, 69, 62]);
    expect(mel.notes.at(-1)!.dur).toBe(3);
    const spans = tl.items.filter((i) => i.kind === 'chord').map((i) => ({ beat: i.beat, dur: (i as { dur: number }).dur, name: (i as { chord: string }).chord }));
    expect(arrange(mel.notes, spans, 4, 2).warnings).toEqual([]);
  });
});
