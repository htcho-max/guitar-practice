import { useState } from 'react';

/** 사진 악보 → 곡 글: Claude 앱에 사진과 함께 붙여 넣을 요청 글 */
export const PHOTO_PROMPT = `첨부한 악보 사진(코드와 멜로디가 있는 리드 시트)을 아래 형식의 글로 옮겨 주세요. 설명 없이 코드 블록 하나로만 답해 주세요.

형식:
{title: 곡 제목}
{artist: 작곡·가수}
{key: 조 (예: D)}
{time: 4/4}
{tempo: 템포 숫자 (없으면 짐작)}

[1절]
| 코드 . 코드 . | 코드 . . . |      ← 한 마디에 박 수만큼 칸, 코드가 이어지면 .
M| 음이름+옥타브+길이 ...          ← 같은 마디들의 멜로디

멜로디 규칙:
- 음: C4 D4 E4 … (가온 도 = C4), 샵은 C#4, 플랫은 Bb3
- 길이: w 온음표, h 2분, q 4분, e 8분, s 16분, t 셋잇단 8분, 점음표는 뒤에 . (q. = 점4분)
- 쉼표: r + 길이 (rq, re), 붙임줄은 길이 뒤에 ~ (h~ q)
- 못갖춘마디로 시작하면 앞을 쉼표로 채워 첫 마디를 박 수만큼 맞추기
- 마디 줄 4마디마다 M| 줄 하나, 코드 마디 수와 멜로디 박 수가 같게
- 도돌이표·D.C.·코다는 펼쳐서 연주 순서대로 적기
- 가사는 적지 않아도 돼요. 잘 안 보이는 음은 {c: 확인 필요 - n마디} 로 표시

예:
| D . . . | G . A . |
M| F#4q E4e D4e D4h | B3q. C#4e A3h |`;

export function PhotoPrompt() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  return (
    <div className="card">
      <button className="card-head link-like" onClick={() => setOpen(!open)} data-testid="photo-prompt">
        <b>📷 악보 사진으로 곡 만들기</b><span className="muted small">{open ? '▲' : 'Claude 앱 이용 ▼'}</span>
      </button>
      {open && (
        <>
          <ol className="plain small steps">
            <li>Claude 앱에서 새 대화를 열고 악보 사진을 올려요 (밝고 반듯하게, 한 쪽씩).</li>
            <li>아래 요청 글을 복사해서 사진과 함께 보내요.</li>
            <li>돌아온 글을 이 칸에 붙여 넣고 저장 → 곡 화면에서 「🎸 핑거스타일로 편곡」.</li>
          </ol>
          <pre className="help-pre">{PHOTO_PROMPT}</pre>
          <button className="primary" onClick={async () => {
            try { await navigator.clipboard.writeText(PHOTO_PROMPT); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { setCopied(false); alert('복사가 안 돼요. 글을 길게 눌러 직접 복사해 주세요.'); }
          }}>{copied ? '복사했어요 ✓' : '요청 글 복사'}</button>
          <p className="hint small">저작권이 있는 악보는 개인 연습용으로만 쓰고, 앱 밖으로 공유하지 마세요.</p>
        </>
      )}
    </div>
  );
}
