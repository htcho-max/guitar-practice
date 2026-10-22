import { describe, it, expect } from 'vitest';
import { parseSong, parseTab } from '../src/song/parse';
import { buildTimeline } from '../src/song/timeline';

describe('곡 읽기', () => {
  it('ChordPro 머리말과 가사 사이 코드', () => {
    const s = parseSong(`{title: 아리랑}\n{artist: 민요}\n{capo: 2}\n{tempo: 90}\n{time: 3/4}\n\n[G]아리랑 아리랑 [C]아라리[G]요`);
    expect(s.meta).toMatchObject({ title: '아리랑', artist: '민요', capo: 2, tempo: 90, beats: 3 });
    const line = s.blocks.find((b) => b.kind === 'line')!;
    expect(line).toEqual({ kind: 'line', segs: [{ chord: 'G', text: '아리랑 아리랑 ' }, { chord: 'C', text: '아라리' }, { chord: 'G', text: '요' }] });
  });
  it('코드 줄 + 가사 줄 (한글 두 칸)', () => {
    const s = parseSong('C       G\n바람이  불어오는');
    // '바람이  ' = 2+2+2+1+1 = 8칸 → G 는 '불' 부터
    expect(s.blocks[0]).toEqual({ kind: 'line', segs: [{ chord: 'C', text: '바람이  ' }, { chord: 'G', text: '불어오는' }] });
  });
  it('가사 앞 여백, 코드만 있는 줄', () => {
    const s = parseSong('    Am\n그대 내게\nC G Am F');
    expect(s.blocks[0]).toEqual({ kind: 'line', segs: [{ text: '그대' }, { chord: 'Am', text: ' 내게' }] });
    expect(s.blocks[1]).toEqual({ kind: 'line', segs: ['C', 'G', 'Am', 'F'].map((c) => ({ chord: c, text: '' })) });
  });
  it('마디 줄과 시간', () => {
    const s = parseSong('| C . G . | Am | % | F G |');
    expect(s.blocks[0]).toEqual({ kind: 'bars', bars: [['C', '.', 'G', '.'], ['Am'], ['Am'], ['F', 'G']] });
    const tl = buildTimeline(s);
    expect(tl.items.map((i) => (i.kind === 'chord' ? `${i.chord}@${i.beat}+${i.dur}` : ''))).toEqual(['C@0+2', 'G@2+2', 'Am@4+4', 'Am@8+4', 'F@12+2', 'G@14+2']);
    expect(tl.beats).toBe(16);
  });
  it('구간 이름과 일반 가사', () => {
    const s = parseSong('[Chorus]\n그냥 가사');
    expect(s.blocks[0]).toEqual({ kind: 'section', label: 'Chorus' });
    expect(s.blocks[1]).toEqual({ kind: 'line', segs: [{ text: '그냥 가사' }] });
  });
});

describe('탭 읽기', () => {
  const tab = [
    'e|-------0-------|-------0-------|',
    'B|-----1---1-----|-----3---3-----|',
    'G|---0-------0---|---0-------0---|',
    'D|---------------|---------------|',
    'A|-3-------------|---------------|',
    'E|---------------|-3-------------|',
  ];
  it('두 마디 8분 아르페지오', () => {
    const t = parseTab(tab);
    expect(t.beats).toBe(8);
    expect(t.events.map((e) => e.beat)).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 4, 4.5, 5, 5.5, 6, 6.5]);
    expect(t.events[0].notes).toEqual([{ string: 1, fret: 3 }]);
    expect(t.events[3].notes).toEqual([{ string: 5, fret: 0 }]);
    expect(t.events[6].notes).toEqual([{ string: 0, fret: 3 }]);
  });
  it('두 자리 프렛, 동시 음, 해머온', () => {
    const t = parseTab(['e|--12--------|', 'B|--10--------|', 'G|------5h7---|', 'D|------------|', 'A|------------|', 'E|------------|']);
    expect(t.events[0].notes).toEqual([{ string: 5, fret: 12 }, { string: 4, fret: 10 }]);
    expect(t.events[2].notes[0]).toEqual({ string: 3, fret: 7, tech: 'h' });
  });
  it('곡 안의 탭은 앞 블록 다음 박에', () => {
    const s = parseSong(['| C |', ...tab].join('\n'));
    const tl = buildTimeline(s);
    const firstTab = tl.items.find((i) => i.kind === 'tab')!;
    expect(firstTab.beat).toBe(4);
    expect(tl.beats).toBe(12);
  });
});

import { SAMPLE_SONGS } from '../src/song/samples';
describe('예시 곡', () => {
  it('아리랑: 코드가 마디 첫 글자에', () => {
    const s = parseSong(SAMPLE_SONGS[0].text);
    const lines = s.blocks.filter((b) => b.kind === 'line' && b.segs.some((x) => x.chord));
    expect(lines).toHaveLength(4);
    expect((lines[0] as { segs: unknown }).segs).toEqual([{ chord: 'G', text: '아리랑 ' }, { chord: 'Em', text: '아리랑 ' }, { chord: 'C', text: '아라리' }, { chord: 'G', text: '요' }]);
    expect(buildTimeline(s).beats).toBe(16 * 3);
  });
  it('로망스: 4마디 셋잇단 36음', () => {
    const s = parseSong(SAMPLE_SONGS[2].text);
    const tab = s.blocks.find((b) => b.kind === 'tab')!;
    expect(tab.kind === 'tab' && tab.events.length).toBe(36);
    expect(tab.kind === 'tab' && tab.events.slice(0, 4).map((e) => +e.beat.toFixed(3))).toEqual([0, 0.333, 0.667, 1]);
    expect(buildTimeline(s).beats).toBe(12);
  });
});

describe('탭 리듬 줄', () => {
  it('R| 줄의 길이대로 (점 4분 + 8분 + 셋잇단)', () => {
    const s = parseSong([
      'R|q.   e  t t t h        |',
      'e|0----3--5-3-1-0--------|',
      'B|-----------------------|',
      'G|-----------------------|',
      'D|-----------------------|',
      'A|-----------------------|',
      'E|-----------------------|',
    ].join('\n'));
    const tab = s.blocks.find((b) => b.kind === 'tab')!;
    if (tab.kind !== 'tab') throw new Error();
    expect(tab.rhythm).toBeDefined();
    expect(tab.events.map((e) => e.beat)).toEqual([0, 1.5, 2, 2.333, 2.667, 3]);
    expect(tab.beats).toBe(8);
  });
  it('리듬 글자가 없는 음은 앞 길이 그대로', () => {
    const t = parseTab(['e|0-0-0-0-|', 'B|--------|', 'G|--------|', 'D|--------|', 'A|--------|', 'E|--------|'], 4, 'R|q       |');
    expect(t.events.map((e) => e.beat)).toEqual([0, 1, 2, 3]);
  });
});
