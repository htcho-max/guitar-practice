import { describe, it, expect } from 'vitest';
import { parseMelody, durToken } from '../src/fingerstyle/melody';
import { arrange, chordSpans, melodyShift } from '../src/fingerstyle/arrange';
import { toSongText } from '../src/fingerstyle/ascii';
import { TUNES } from '../src/fingerstyle/tunes';
import { parseSong } from '../src/song/parse';
import { buildTimeline } from '../src/song/timeline';
import { STANDARD } from '../src/guitar/tunings';

describe('멜로디 글자', () => {
  it('음·길이·점·쉼', () => {
    const m = parseMelody('M| G4q F#4e. Bb3s | rh C5w');
    expect(m.errors).toEqual([]);
    expect(m.notes.map((n) => [n.beat, n.dur, n.midi])).toEqual([[0, 1, 67], [1, 0.75, 66], [1.75, 0.25, 58], [2, 2, null], [4, 4, 72]]);
    expect(durToken(1.5)).toBe('q.');
    expect(durToken(1.25)).toBeNull();
  });
});

describe('연습곡 편곡', () => {
  for (const t of TUNES) {
    it(`${t.title}: 마디 맞음, 모든 스타일에서 멜로디가 맨 위, 탭 글로 바꿔 다시 읽어도 같은 박`, () => {
      const mel = parseMelody(t.melody);
      expect(mel.errors).toEqual([]);
      const spans = chordSpans(t.chords, t.beats);
      expect(mel.beats, '멜로디 박 = 코드 박').toBe(spans.reduce((a, c) => a + c.dur, 0));
      expect(mel.beats % t.beats).toBe(0);
      for (const [style, octave] of [[1, 'auto'], [2, 'auto'], [3, 'auto'], [4, 'auto'], [5, 'auto'], [6, 'auto'], [2, 'high'], [4, 'high'], [6, 'high']] as const) {
        const a = arrange(mel.notes, spans, t.beats, style, { octave });
        expect(a.warnings, `${t.id} ${style}`).toEqual([]);
        // 멜로디 음은 모두 나옴
        expect(a.events.flatMap((e) => e.notes).filter((n) => n.voice === 'mel')).toHaveLength(mel.notes.filter((n) => n.midi !== null).length);
        for (const e of a.events) {
          const mel1 = e.notes.find((n) => n.voice === 'mel');
          if (mel1) for (const n of e.notes) if (n.voice !== 'mel') expect(n.midi, `${t.id} s${style} ${e.beat}`).toBeLessThan(mel1.midi);
          expect(new Set(e.notes.map((n) => n.string)).size).toBe(e.notes.length);
          for (const n of e.notes) expect(STANDARD.midi[n.string] + (n.harm ? ({ 12: 12, 7: 19, 5: 24 } as Record<number, number>)[n.fret] : n.fret)).toBe(n.midi);
          // 한 손 폭: 짚는 음(개방·하모닉스 빼고)이 5칸 안
          const fr = e.notes.filter((n) => n.fret > 0 && !n.harm).map((n) => n.fret);
          if (fr.length > 1) expect(Math.max(...fr) - Math.min(...fr), `${t.id} s${style} ${octave} ${e.beat} 손 폭`).toBeLessThanOrEqual(5);
        }
        // 1번 박마다 베이스
        for (let b = 0; b < a.beats; b += t.beats) expect(a.events.find((e) => Math.abs(e.beat - b) < 1e-6)?.notes.some((n) => n.voice === 'bass'), `${t.id} s${style} ${octave} 마디 ${b / t.beats + 1}`).toBe(true);
        if (octave === 'high') expect(a.maxFret, `${t.id} 하이 포지션`).toBeGreaterThanOrEqual(7);
        const text = toSongText(a, { title: t.title });
        const song = parseSong(text);
        const tl = buildTimeline(song);
        expect(tl.beats, `${t.id} s${style} 탭 박`).toBe(a.beats);
        const tabBeats = tl.items.filter((i) => i.kind === 'tab').map((i) => i.beat);
        expect(tabBeats, `${t.id} s${style} ${octave}`).toEqual(a.events.map((e) => e.beat));
        // 하모닉스·퍼커시브도 탭 글로 살아남음
        const tabNotes = tl.items.filter((i) => i.kind === 'tab').flatMap((i) => (i as { notes: { harm?: boolean; dead?: boolean }[] }).notes);
        expect(tabNotes.filter((n) => n.harm).length).toBe(a.events.flatMap((e) => e.notes).filter((n) => n.harm).length);
        if (style >= 5) expect(tabNotes.some((n) => n.dead)).toBe(true);
      }
    });
  }
  it('멜로디 옥타브: 환희의 송가(G4~D5)는 한 옥타브 내림, 작은 별은 그대로', () => {
    expect(melodyShift(parseMelody(TUNES[1].melody).notes)).toBe(-12);
    expect(melodyShift(parseMelody(TUNES[0].melody).notes)).toBe(0);
  });
  it('2단계 이상은 박마다 엄지', () => {
    const t = TUNES[0];
    const a = arrange(parseMelody(t.melody).notes, chordSpans(t.chords, 4), 4, 2);
    for (let b = 0; b < a.beats; b++) expect(a.events.find((e) => e.beat === b)?.notes.some((n) => n.voice === 'bass'), `박 ${b}`).toBe(true);
  });
});

import { SAMPLE_SONGS } from '../src/song/samples';
describe('내 곡 멜로디 → 편곡', () => {
  it('작은 별 예시: M| 줄은 시간에 안 들어가고, 멜로디와 코드 박이 같음', () => {
    const s = parseSong(SAMPLE_SONGS.find((x) => x.title.startsWith('반짝반짝'))!.text);
    const mel = parseMelody(s.blocks.filter((b) => b.kind === 'melody').map((b) => (b as { text: string }).text).join(' '));
    const tl = buildTimeline(s);
    expect(mel.errors).toEqual([]);
    expect(tl.beats).toBe(48);
    expect(mel.beats).toBe(48);
    const spans = tl.items.filter((i) => i.kind === 'chord').map((i) => ({ beat: i.beat, dur: (i as { dur: number }).dur, name: (i as { chord: string }).chord }));
    expect(arrange(mel.notes, spans, 4, 3).warnings).toEqual([]);
  });
});
