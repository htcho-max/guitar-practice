import { describe, it, expect } from 'vitest';
import { arrange, chordSpans } from '../src/fingerstyle/arrange';
import { parseMelody } from '../src/fingerstyle/melody';
import { toSongText } from '../src/fingerstyle/ascii';
import { parseSong } from '../src/song/parse';
import { buildTimeline } from '../src/song/timeline';
import { buildPlan } from '../src/song/plan';
import { tuningById, tuningDiff, tuningFromText, suggestTunings } from '../src/guitar/tunings';
import { STANDARD } from '../src/guitar/tunings';

const mel = parseMelody('D4q E4q F#4h | A4h. rq | G4q F#4q E4h | D4w');
const ch = chordSpans('| D . . . | A . . . | G . A . | D . . . |', 4);

describe('7단계 · 슬랩 + 인공 하모닉스', () => {
  const arr = arrange(mel.notes, ch, 4, 7);
  it('2·4박은 슬랩', () => {
    expect(arr.events.filter((e) => e.slap).map((e) => e.beat % 4)).toEqual(expect.arrayContaining([1, 3]));
  });
  it('길게 끄는 음은 하모닉스 (자연 또는 인공)', () => {
    const long = arr.events.filter((e) => e.notes.some((n) => n.voice === 'mel' && (n.harm || n.art)));
    expect(long.length).toBeGreaterThanOrEqual(2);
    const art = arr.events.flatMap((e) => e.notes).find((n) => n.art);
    if (art) expect(STANDARD.midi[art.string] + art.fret + 12).toBe(art.midi);
  });
  it('탭 글로 저장하고 다시 읽으면 슬랩·인공 하모닉스 소리', () => {
    const txt = toSongText(arr, { title: 't' });
    expect(txt).toMatch(/S/);
    const song = parseSong(txt);
    const plan = buildPlan(buildTimeline(song), { beatsPerBar: 4, tuning: STANDARD.midi, capo: 0, tabShift: 0, accomp: 'none', strum: '', fingerId: 'pima', shown: (n) => n, shapeOf: () => null });
    expect(plan.some((e) => e.sound?.kind === 'slap')).toBe(true);
  });
});

describe('변칙 조율', () => {
  it('글 → id, 차이, 추천', () => {
    expect(tuningFromText('DADGAD')).toBe('dadgad');
    expect(tuningFromText('Drop D')).toBe('dropd');
    expect(tuningFromText('open g')).toBe('openg');
    expect(tuningDiff(STANDARD.midi, tuningById('dropd').midi)).toEqual([{ idx: 0, from: 40, to: 38, semis: -2 }]);
    expect(suggestTunings(2).map((x) => x.id)).toEqual(expect.arrayContaining(['dropd', 'dadgad', 'opend', 'std']));
  });
  it('DADGAD 편곡은 {tuning} 이 적히고 곡이 그 조율로 읽힘', () => {
    const arr = arrange(mel.notes, ch, 4, 2, { tuning: tuningById('dadgad').midi });
    const txt = toSongText(arr, { title: 't' });
    expect(txt).toContain('{tuning: dadgad}');
    expect(parseSong(txt).meta.tuning).toBe('dadgad');
    expect(arr.events.some((e) => e.notes.some((n) => n.voice === 'bass' && n.string === 0 && n.fret === 0))).toBe(true); // 낮은 D 개방
  });
});
