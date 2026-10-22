/** 예시 곡 (모두 저작권이 끝난 곡: 민요·찬송가(1779)·작자 미상 기타곡) */
export const SAMPLE_SONGS: { title: string; artist: string; text: string }[] = [
  {
    title: '아리랑',
    artist: '경기 민요',
    text: `{title: 아리랑}
{artist: 경기 민요}
{time: 3/4}
{tempo: 84}
{key: G}
{chord_beats: 3}
{strum: D-DUDU}
{c: 코드 줄 + 가사 줄 형식 — 코드를 가사 글자 위에 맞추고(한글은 두 칸), 코드 하나가 한 마디}

G      Em     C     G
아리랑 아리랑 아라리요
G      Em     Am  D
아리랑 고개로 넘어간다
G    C      G      Em
나를 버리고 가시는 님은
G      Em     D       G
십리도 못 가서 발병 난다`,
  },
  {
    title: 'Amazing Grace',
    artist: 'John Newton (1779)',
    text: `{title: Amazing Grace}
{artist: John Newton (1779)}
{time: 3/4}
{tempo: 76}
{finger: waltz}
{c: 가사 사이 [코드] 형식 — 마디 줄로 쓰면 박을 정확히 맞출 수 있어요}

A[G]mazing grace how [C]sweet the [G]sound
That saved a wretch like [D]me
I [G]once was lost but [C]now am [G]found
Was [Em]blind but [D]now I [G]see

{soc: 마디 줄로 쓴 같은 곡}
| G | G | C | G |
| G | G | D | D |
| G | G7 | C | G |
| Em | D | G | G |`,
  },
  {
    title: '로망스 (첫 네 마디)',
    artist: '작자 미상',
    text: `{title: 로망스 (첫 네 마디)}
{artist: 작자 미상}
{time: 3/4}
{tempo: 60}
{c: 셋잇단 아르페지오 — 1번 줄 멜로디, 2번 줄 개방, 6번 줄 베이스}

e|-7-----7-----7-----|-7-----5-----3-----|-3-----2-----0-----|-0-----3-----7-----|
B|---0-0---0-0---0-0-|---0-0---0-0---0-0-|---0-0---0-0---0-0-|---0-0---0-0---0-0-|
G|-------------------|-------------------|-------------------|-------------------|
D|-------------------|-------------------|-------------------|-------------------|
A|-------------------|-------------------|-------------------|-------------------|
E|-0-----------------|-0-----------------|-0-----------------|-0-----------------|`,
  },
];

export const FORMAT_HELP = `머리말: {title: 제목} {artist: 가수} {capo: 2} {tempo: 90} {time: 3/4}
  {strum: D-DU-UDU} (한 마디 긁기, D 내려 U 올려 - 쉼 x 뮤트) {finger: travis} (핑거 패턴)
  {chord_beats: 2} (가사 줄 코드 하나가 몇 박, 기본 한 마디)
가사 사이 코드: [C]바람이 불어 [G]오는 곳
코드 줄 + 가사 줄: 코드를 가사 위 글자 자리에 맞춰 (한글은 두 칸)
마디 줄: | C . G . | Am | % |  ( . 은 이어서, % 는 앞 마디 반복)
탭: e| B| G| D| A| E| 로 시작하는 여섯 줄 (마디 | 로 나누면 박이 정확해요)
  탭 위에 리듬 줄 R| 을 두면 그 길이대로: w온 h2분 q4분 e8분 s16분 t셋잇단8분, 점(.)은 1.5배
  R|q  e e q  q  |   ← 글자를 그 음 숫자 위에 맞춰요
구간: {soc: 후렴} [Chorus] 처럼 한 줄에`;
