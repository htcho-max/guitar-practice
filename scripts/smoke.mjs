// 빌드본 + 가짜 마이크로 전체 흐름 확인 (npm run smoke)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { existsSync } from 'node:fs';
const exe = process.env.CHROMIUM_PATH ?? (existsSync('/opt/pw-browsers/chromium') ? '/opt/pw-browsers/chromium' : undefined);

const server = spawn('npx', ['vite', 'preview', '--port', '4329', '--strictPort'], { stdio: 'ignore', detached: true });
await new Promise((r) => setTimeout(r, 2500));
const URL = 'http://localhost:4329/';
let pass = 0, fail = 0;
const ok = (c, msg) => { console.log(`${c ? 'PASS' : 'FAIL'} ${msg}`); if (c) pass++; else { fail++; process.exitCode = 1; } };
const num = (s) => Number(String(s).replace(/[^\d.+-]/g, ''));

async function launch(wav, viewport = { width: 390, height: 844 }) {
  const browser = await chromium.launch({
    timeout: 20000, executablePath: exe,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${path.resolve('scripts', wav)}`, '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(URL);
  return { browser, page, errors };
}
const seen = (loc, timeout = 4000) => loc.first().waitFor({ timeout }).then(() => true, () => false);
async function shotTall(page, file) {
  const vp = page.viewportSize();
  const h = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: vp.width, height: Math.max(vp.height, h) });
  await page.waitForTimeout(200);
  await page.screenshot({ path: file });
  await page.setViewportSize(vp);
}
const tab = (page, name) => page.locator('.tabbar').getByRole('button', { name }).click();

try {
  // ── 1. 처음: 단계 고르기 → 오늘 ──
  {
    const { browser, page, errors } = await launch('test-c-chord.wav');
    ok(await seen(page.getByTestId('level-2')), '처음엔 단계 고르기');
    await page.screenshot({ path: 'scripts/shot-level.png' });
    await page.getByTestId('level-2').click();
    ok(await seen(page.getByText('오늘 할 일')), '오늘 화면');
    ok(await seen(page.getByText(/코드 전환 1분: C ↔ F/)), '초급 전환 쌍 추천 C ↔ F');
    await shotTall(page, 'scripts/shot-today.png');

    // 코드 사전 → C → 긁어서 확인 (가짜 마이크 = C 코드)
    await tab(page, '코드');
    await page.locator('.chips').getByRole('button', { name: 'F', exact: true }).first().click();
    ok(await seen(page.locator('svg[aria-label="F 코드 그림"]')), 'F 코드 그림');
    await page.locator('.root-grid').getByRole('button', { name: 'C', exact: true }).click();
    await page.locator('.chips.scroll-x').getByRole('button', { name: /^C 메이저/ }).click();
    ok(await seen(page.locator('svg[aria-label="C 코드 그림"]')), 'C 코드 그림');
    await page.getByRole('button', { name: '▶ 긁기' }).click();
    await page.getByRole('button', { name: '🎤 긁어서 확인' }).click();
    ok(await seen(page.getByText('✓ 맞게 들려요'), 8000), 'C 코드 판정: 맞게 들려요');
    await shotTall(page, 'scripts/shot-chord-ok.png');
    // 다른 코드(Am) 로 바꾸면 C 소리는 맞음이 아님
    await page.locator('.root-grid').getByRole('button', { name: 'A', exact: true }).click();
    await page.locator('.chips.scroll-x').getByRole('button', { name: /^Am 마이너/ }).click();
    ok(await seen(page.getByText(/다르게 들려요|거의 맞아요/), 8000), 'Am 자리에 C 소리 → 맞음 아님');
    const heard = await page.getByTestId('chord-verdict').textContent();
    ok(/들린 코드: C\b/.test(heard), `들린 코드 C (${heard.slice(0, 60)})`);
    await page.getByRole('button', { name: '마이크 끄기' }).click();
    // 바레 코드 모양 넘기기
    await page.locator('.root-grid').getByRole('button', { name: 'B', exact: true }).click();
    await page.locator('.chips.scroll-x').getByRole('button', { name: /^Bm 마이너/ }).click();
    ok(await seen(page.getByText('5번 줄 근음 바레')), 'Bm = 5번 줄 근음 바레');
    await page.getByRole('button', { name: '다음 모양' }).click();
    ok(await seen(page.getByText('6번 줄 근음 바레')), 'Bm 다음 모양 6번 줄');
    await page.getByRole('button', { name: '도수' }).click();
    await page.screenshot({ path: 'scripts/shot-chord-bm.png' });

    // 전환 연습: 박자 맞춰 바꾸기
    await page.getByRole('button', { name: '전환 연습' }).click();
    await page.getByRole('button', { name: '박자 맞춰 바꾸기' }).click();
    await page.getByRole('button', { name: '▶ 시작' }).click();
    await page.waitForTimeout(2000);
    ok(await seen(page.locator('.dot.on')), '전환 연습 박 표시');
    await page.screenshot({ path: 'scripts/shot-change-beat.png' });
    await page.getByRole('button', { name: '■ 정지' }).click();
    // 1분 전환: 손으로 +1 두 번 → 그만
    await page.getByRole('button', { name: '1분 전환' }).click();
    await page.getByRole('button', { name: '▶ 1분 시작' }).click();
    await page.getByRole('button', { name: '+1' }).click();
    await page.getByRole('button', { name: '+1' }).click();
    ok(num(await page.getByTestId('change-count').textContent()) >= 2, '1분 전환 +1 세기');
    await page.screenshot({ path: 'scripts/shot-change-minute.png' });
    await page.getByRole('button', { name: '그만' }).click();

    // 스트럼: 들어 보기 → 따라 긁기
    await page.getByRole('button', { name: '스트럼', exact: true }).click();
    ok(await seen(page.locator('.strum-bar')), '스트럼 패턴 그림');
    await page.getByRole('button', { name: '기본 포크 (D-DU-UDU)' }).click();
    ok((await page.locator('.strum-arrow.up').count()) >= 6, '포크 패턴 업 화살표');
    await page.getByRole('button', { name: '▶ 들어 보기' }).click();
    await page.waitForTimeout(1200);
    ok(await seen(page.locator('.strum-cell.now')), '스트럼 들어 보기: 지금 칸');
    await page.getByRole('button', { name: '■ 정지' }).click();
    for (let i = 0; i < 8; i++) await page.getByRole('button', { name: '+4' }).click();
    const sbpm = num(await page.getByTestId('strum-bpm').textContent());
    await page.getByRole('button', { name: '🎤 따라 긁기' }).click();
    ok(await seen(page.getByTestId('strum-result'), ((4 + 16) * 60 / sbpm) * 1000 + 3000), `따라 긁기 결과 (${sbpm} BPM)`);
    await shotTall(page, 'scripts/shot-strum.png');

    // 내 긁기 패턴 만들기
    await page.getByTestId('strum-new').click();
    ok(await seen(page.getByRole('dialog', { name: '긁기 패턴 만들기' })), '내 긁기 편집기');
    await page.getByRole('dialog').getByLabel('패턴 이름').fill('내 셔플');
    await page.getByRole('dialog').getByRole('button', { name: 'e 칸' }).first().click().catch(() => {});
    await page.getByRole('dialog').getByRole('button', { name: '& 칸' }).first().click();
    await page.getByRole('dialog').getByRole('button', { name: '저장' }).click();
    ok(await seen(page.locator('.chip.on', { hasText: '내 셔플' })), '내 긁기 저장·선택');
    // 핑거: 들어 보기 → 따라 치기 (가짜 마이크 소리로 결과까지)
    await tab(page, '핑거');
    // 핑거스타일 (멜로디 + 베이스)
    ok(await seen(page.getByRole('button', { name: '핑거스타일', exact: true })), '핑거 탭: 핑거스타일 / 아르페지오');
    await page.locator('.chips').getByRole('button', { name: /환희의 송가/ }).click();
    await page.getByRole('button', { name: /2단계 · 박마다 엄지/ }).click();
    ok((await page.locator('svg.fs-bar').count()) === 8, '환희의 송가 8마디 탭');
    ok((await page.locator('.tab-num.fs-mel').count()) >= 28, '멜로디 음 표시');
    await page.getByRole('button', { name: '▶ 들어 보기' }).click();
    await page.waitForTimeout(1500);
    ok(await seen(page.locator('.fs-bar .tab-now')), '핑거스타일 들어 보기: 지금 칸');
    await page.getByRole('button', { name: '■ 정지' }).click();
    await page.getByLabel('베이스').uncheck();
    ok((await page.locator('.fs-bar .tab-num:not(.fs-mel)').count()) === 0, '베이스 끄면 멜로디만 보임');
    await page.getByLabel('베이스').check();
    for (let i = 0; i < 10; i++) await page.getByRole('button', { name: '+4' }).click();
    const fsb = num(await page.getByTestId('fs-bpm').textContent());
    await page.getByTestId('fs-follow').click();
    ok(await seen(page.getByTestId('fs-result'), (36 * 60 / fsb) * 1000 + 3000), `핑거스타일 따라 치기 결과 (${fsb} BPM)`);
    await shotTall(page, 'scripts/shot-fingerstyle.png');
    // 하이 포지션 + 5·6단계
    await page.getByRole('button', { name: '옥타브 위 (하이 포지션)' }).click();
    await page.getByRole('button', { name: /6단계 · 퍼커시브 \+ 하모닉스/ }).click();
    ok(await seen(page.locator('.fs-perc')), '6단계: 퍼커시브 ✕');
    ok(await seen(page.locator('.tab-num.fs-harm')), '6단계: 하모닉스 <12>');
    const mf = num((await page.getByText(/최고 \d+프렛/).textContent()).match(/최고 (\d+)/)[1]);
    ok(mf >= 7, `하이 포지션 최고 ${mf}프렛`);
    await shotTall(page, 'scripts/shot-fs-high.png');
    await page.getByRole('button', { name: '자동', exact: true }).click();
    // 기법 연습장
    await page.getByRole('button', { name: '기법', exact: true }).click();
    ok(await seen(page.locator('.perc-row')), '기법: 퍼커시브');
    await page.getByRole('button', { name: '▶ 들어 보기' }).click();
    await page.waitForTimeout(1200);
    ok(await seen(page.locator('.perc-cell.now')), '퍼커시브 들어 보기');
    await page.getByRole('button', { name: '■ 정지' }).click();
    await page.getByRole('button', { name: '하모닉스', exact: true }).click();
    await page.getByRole('button', { name: '7프렛' }).click();
    ok(await seen(page.getByTestId('harm-verdict')), '기법: 하모닉스');
    await page.getByRole('button', { name: '인공', exact: true }).click();
    ok(await seen(page.getByText(/오른손은 14프렛 위/)), '기법: 인공 하모닉스');
    await page.getByRole('button', { name: '퍼커시브', exact: true }).click();
    await page.getByRole('button', { name: '오른손 탭핑 + 슬랩' }).click();
    ok(await seen(page.locator('.perc-cell', { hasText: '탭 12' })), '기법: 탭핑 + 슬랩 패턴');
    await page.getByRole('button', { name: '▶ 들어 보기' }).click();
    await page.waitForTimeout(800);
    await page.getByRole('button', { name: '■ 정지' }).click();
    await page.getByRole('button', { name: '해머온·풀오프' }).click();
    ok(await seen(page.getByText(/5h7/)), '기법: 해머온');
    await shotTall(page, 'scripts/shot-technique.png');
    await page.getByRole('button', { name: '아르페지오', exact: true }).click();
    ok(await seen(page.locator('svg.tab-bar')), '핑거 탭 그림');
    // 내 핑거 패턴 만들기: 기본 8칸에서 4박 a 를 빼고 몸통 치기
    await page.getByTestId('finger-new').click();
    ok(await seen(page.getByRole('dialog', { name: '핑거 패턴 만들기' })), '내 패턴 편집기');
    await page.getByRole('dialog').getByLabel('패턴 이름').fill('내 아르페지오');
    await page.getByRole('dialog').getByRole('button', { name: '3 ✕ 몸통 치기' }).click();
    await page.getByRole('dialog').getByRole('button', { name: '저장' }).click();
    ok(await seen(page.locator('.chip.on', { hasText: '내 아르페지오' })), '내 패턴 저장·선택');
    ok(await seen(page.locator('.tab-hit')), '내 패턴: 몸통 치기 표시');
    await page.screenshot({ path: 'scripts/shot-mypattern.png' });
    await page.locator('.chips').getByRole('button', { name: 'p-i-m-a 오르기' }).click();
    await page.locator('.chips').getByRole('button', { name: 'C – G – Am – F' }).click();
    ok((await page.locator('svg.tab-bar').count()) === 4, '진행 4마디');
    await page.getByRole('button', { name: '▶ 들어 보기' }).click();
    await page.waitForTimeout(1500);
    ok(await seen(page.locator('.tab-now')), '들어 보기: 지금 칸 표시');
    await shotTall(page, 'scripts/shot-finger-listen.png');
    await page.getByRole('button', { name: '■ 정지' }).click();
    await page.locator('.chips').getByRole('button', { name: 'C – Am', exact: true }).click();
    await page.getByRole('button', { name: '2마디' }).click();
    // 템포 올리기 (빨리 끝나게)
    for (let i = 0; i < 6; i++) await page.getByRole('button', { name: '+4' }).click();
    const fbpm = num(await page.getByTestId('finger-bpm').textContent());
    await page.getByRole('button', { name: '🎤 따라 치기' }).click();
    const waitMs = ((4 + 8) * 60 / fbpm) * 1000 + 2500;
    ok(await seen(page.getByTestId('finger-result'), waitMs), `따라 치기 결과 (${fbpm} BPM)`);
    await shotTall(page, 'scripts/shot-finger-result.png');

    // 내 곡: 예시 넣기 → 아리랑 열기 → 재생
    await tab(page, '내 곡');
    await page.getByRole('button', { name: /예시 곡 넣기/ }).click();
    ok(await seen(page.getByRole('button', { name: /아리랑/ })), '예시 곡 목록');
    await page.getByRole('button', { name: /아리랑/ }).click();
    ok(await seen(page.locator('.sb-chord', { hasText: 'Em' })), '아리랑 코드 Em 표시');
    await page.getByRole('button', { name: '▶ 재생' }).click();
    await page.waitForTimeout(84 ? 3500 : 0);
    ok(await seen(page.locator('.sb-seg.now')), '곡 재생: 지금 코드 표시');
    await page.getByRole('button', { name: '■ 정지' }).click();
    // 카포 2 → 같은 소리로 잡는 모양이 F
    await page.locator('.song-controls .ctl', { hasText: '카포' }).getByRole('button', { name: '+' }).click();
    await page.locator('.song-controls .ctl', { hasText: '카포' }).getByRole('button', { name: '+' }).click();
    ok(await seen(page.locator('.sb-chord', { hasText: /^F$/ })), '카포 2 → G 모양이 F 로');
    await shotTall(page, 'scripts/shot-song-arirang.png');
    await page.getByRole('button', { name: 'F', exact: true }).first().click();
    ok(await seen(page.locator('.sheet svg[aria-label="F 코드 그림"]')), '코드 눌러 그림');
    await page.getByRole('button', { name: '닫기' }).click();
    await page.getByRole('button', { name: '목록으로' }).click();
    // 로망스 (탭)
    await page.getByRole('button', { name: /로망스/ }).click();
    await page.getByRole('button', { name: '▶ 재생' }).click();
    await page.waitForTimeout(4500);
    ok(await seen(page.locator('.sb-tab-now')), '탭 재생: 지금 음 막대');
    await shotTall(page, 'scripts/shot-song-romance.png');
    await page.getByRole('button', { name: '■ 정지' }).click();
    await page.getByRole('button', { name: '목록으로' }).click();
    // 구간 고르기 → 따라 치기 (녹음 켜고) → 결과 · 녹음
    await page.getByRole('button', { name: /아리랑/ }).click();
    await page.getByTestId('range-pick').click();
    await page.locator('.sb-wrap', { hasText: '아라리' }).click();
    await page.locator('.sb-wrap', { hasText: '고개로' }).click();
    ok(await seen(page.getByText('8마디 구간')), '구간 2줄 = 8마디');
    ok((await page.locator('.sb-wrap.in-range').count()) === 2, '구간 표시 2줄');
    await page.locator('.song-controls .ctl', { hasText: '템포' }).getByRole('button', { name: '+' }).click();
    for (let i = 0; i < 8; i++) await page.locator('.song-controls .ctl', { hasText: '템포' }).getByRole('button', { name: '+' }).click();
    await page.getByLabel('● 녹음').check();
    await page.getByTestId('song-follow').click();
    ok(await seen(page.getByTestId('song-result'), 16000), '곡 따라 치기 결과');
    ok(await seen(page.locator('.sb-seg.ok, .sb-seg.close, .sb-seg.wrong')), '코드 판정 색');
    ok(await seen(page.getByText('내 녹음')), '녹음 저장');
    await shotTall(page, 'scripts/shot-song-follow.png');
    // 짧게 하나 더 녹음 → A/B 비교
    await page.getByRole('button', { name: '▶ 재생' }).click();
    await page.waitForTimeout(2500);
    await page.getByRole('button', { name: '■ 정지' }).click();
    ok(await seen(page.locator('.rec-list li').nth(1), 5000), '녹음 2개');
    const boxes = page.getByLabel('비교할 녹음으로 고르기');
    await boxes.nth(0).check(); await boxes.nth(1).check();
    ok(await seen(page.getByTestId('ab-compare')), 'A/B 비교');
    ok(await seen(page.locator('.wave rect'), 5000), '파형');
    await shotTall(page, 'scripts/shot-recordings.png');
    // v0.7: 약한 마디 · 원곡과 겹쳐 듣기
    ok(await seen(page.getByTestId('weak-bars'), 3000), '약한 마디 칩 (따라 치기 뒤)');
    if (await page.getByTestId('weak-bars').count()) {
      await page.getByTestId('weak-bars').locator('.chip').first().click();
      ok(await seen(page.locator('.focus-tag')), '약한 마디 집중 (반복 구간)');
      await page.screenshot({ path: 'scripts/shot-weak-focus.png' });
      await page.locator('.range-row').getByRole('button', { name: '전체로' }).click();
    }
    ok(await seen(page.getByTestId('rec-overlay')), '녹음: 원곡과 겹쳐 듣기 버튼');
    await page.getByTestId('rec-overlay').first().click();
    await page.waitForTimeout(1500);
    ok(await seen(page.getByRole('button', { name: '■ 정지' })), '겹쳐 듣기 재생 중');
    await page.getByRole('button', { name: '■ 정지' }).click();
    await page.getByRole('button', { name: '목록으로' }).click();
    // 멜로디 있는 곡 → 핑거스타일 편곡 → 새 곡으로 저장
    await page.getByRole('button', { name: /반짝반짝 작은 별 \(멜로디 포함\)/ }).click();
    await page.getByTestId('arrange-open').click();
    ok(await seen(page.getByRole('dialog', { name: '핑거스타일 편곡' })), '편곡 창');
    ok((await page.locator('.sheet svg.fs-bar').count()) === 12, '작은 별 12마디 편곡');
    await page.getByRole('dialog').getByRole('button', { name: /3단계/ }).click();
    await page.getByTestId('arrange-save').click();
    ok(await seen(page.getByText('새 곡으로 저장했어요')), '편곡 저장');
    await shotTall(page, 'scripts/shot-arrange.png');
    await page.getByRole('dialog').getByRole('button', { name: '닫기' }).click();
    await page.getByRole('button', { name: '목록으로' }).click();
    await page.getByRole('button', { name: /작은 별 \(멜로디 포함\) \(핑거스타일 3단계\)/ }).click();
    ok(await seen(page.locator('.sb-tab')), '편곡한 곡: 탭');
    await page.getByRole('button', { name: '▶ 재생' }).click();
    await page.waitForTimeout(3000);
    ok(await seen(page.locator('.sb-tab-now')), '편곡한 곡 재생');
    await page.getByRole('button', { name: '■ 정지' }).click();
    // v0.7: 손 위치 지도 · 탭 고치기
    ok(await seen(page.getByTestId('pos-map')), '손 위치 지도');
    await page.getByTestId('pos-map').locator('.card-head').click();
    ok(await seen(page.locator('.pos-cell')), '마디별 손 위치');
    await page.getByTestId('tab-edit').click();
    ok(await seen(page.locator('.te-col')), '탭 고치기: 칸 목록');
    const before = await page.locator('.te-col').count();
    await page.locator('.te-col').first().click();
    ok(await seen(page.getByRole('dialog', { name: '탭 칸 고치기' })), '칸 고치기 창');
    await page.getByLabel('1번 줄 프렛').fill('12');
    await page.getByLabel('1번 줄 기법').selectOption('harm');
    await page.getByTestId('te-apply').click();
    await page.locator('.te-col').nth(1).click();
    await page.getByRole('button', { name: '둘로 나누기' }).click();
    ok((await page.locator('.te-col').count()) === before + 1, '칸 둘로 나누기');
    await page.getByTestId('tab-save').first().click();
    await page.waitForTimeout(400);
    await page.getByTestId('tab-edit').click();
    ok(await seen(page.locator('.sb-tab', { hasText: '<12>' })), '고친 탭이 곡에 저장 (<12>)');
    await shotTall(page, 'scripts/shot-tab-edit.png');
    await page.getByRole('button', { name: '목록으로' }).click();
    // MusicXML 리드시트 불러오기 → 편곡 (하이 포지션)
    await page.getByTestId('song-file').setInputFiles('scripts/test-leadsheet.musicxml');
    ok(await seen(page.getByText(/곡 1개를 불러왔어요/)), 'MusicXML 불러오기');
    await page.getByRole('button', { name: /시험 리드시트/ }).click();
    ok(await seen(page.locator('.sb-melody')), 'MusicXML → 멜로디 줄');
    await page.getByTestId('arrange-open').click();
    await page.getByRole('dialog').getByRole('button', { name: '옥타브 위 (하이 포지션)' }).click();
    ok(await seen(page.locator('.sheet svg.fs-bar')), 'MusicXML 곡 편곡');
    // v0.7: 7단계 + DADGAD 로 저장 → 곡에서 조율 안내 → 튜너
    await page.getByRole('dialog').getByRole('button', { name: /7단계/ }).click();
    await page.getByLabel('편곡 조율').selectOption('dadgad');
    ok(await seen(page.locator('.sheet .fs-perc', { hasText: 'S' })), '7단계: 슬랩 표시');
    await page.screenshot({ path: 'scripts/shot-arrange7.png' });
    await page.getByTestId('arrange-save').click();
    await page.getByRole('dialog').getByRole('button', { name: '닫기' }).click();
    await page.getByRole('button', { name: '목록으로' }).click();
    await page.getByRole('button', { name: /7단계.*DADGAD/ }).click();
    ok(await seen(page.getByTestId('song-tuning')), '곡 조율 안내 (DADGAD)');
    await page.getByTestId('song-tuning').getByRole('button').click();
    ok(await seen(page.getByTestId('tuning-guide')), '튜너: 바꿀 줄 안내');
    ok(await seen(page.getByText(/6번 줄 E2 → /)), '6번 줄 E → D');
    await page.getByTestId('tuning-guide').getByRole('button', { name: '튜너를 이 조율로 맞추기' }).click();
    ok(await seen(page.getByText(/튜너가 DADGAD 에 맞춰졌어요/)), '튜너 조율 바꿈');
    await page.screenshot({ path: 'scripts/shot-tuning-guide.png' });
    await page.locator('.tuner-display').waitFor();
    await page.locator('select').filter({ hasText: '표준' }).last().selectOption('std');
    await tab(page, '내 곡');
    // 새 곡 붙여 넣기
    await page.getByRole('button', { name: '＋ 새 곡' }).click();
    await page.getByTestId('photo-prompt').click();
    ok(await seen(page.getByRole('button', { name: '요청 글 복사' })), '사진 악보 요청 글');
    await page.getByTestId('song-textarea').fill('{title: 시험 곡}\n{capo: 1}\nAm      F\n그대 내게 행복을\n| C . G . | Am |');
    ok(await seen(page.getByText(/코드 \d+개/)), '편집기: 알아본 코드 수');
    await page.getByRole('button', { name: '저장' }).click();
    ok(await seen(page.locator('.song-title', { hasText: '시험 곡' })), '새 곡 저장 → 열림');
    await page.screenshot({ path: 'scripts/shot-song-new.png' });

    // 메트로놈
    await tab(page, '튜너');
    await page.getByRole('button', { name: '메트로놈', exact: true }).click();
    await page.getByRole('button', { name: '+5' }).click();
    await page.getByTestId('metro-toggle').click();
    await page.waitForTimeout(1200);
    ok((await page.locator('.dot.on').count()) === 1, '메트로놈 박 표시');
    await tab(page, '오늘');
    ok(await seen(page.locator('.status-chip')), '다른 탭에서 메트로놈 표시');
    await page.locator('.status-chip button').click();
    ok(await seen(page.getByText(/핑거|코드 전환/)), '오늘 화면: 오늘 한 연습');
    ok(await seen(page.getByTestId('reviews-toggle')), '복습함 (따라 치기 실패가 들어감)');
    await page.getByTestId('reviews-toggle').click();
    ok(await seen(page.getByTestId('review-list')), '복습함 전체 목록');
    await page.getByTestId('trend-toggle').click();
    ok(await seen(page.getByTestId('trends')), '주별 추이 열기');
    ok(await seen(page.getByText('패턴 템포 (처음 → 통과한 최고)')), '패턴 발전 기록');
    await shotTall(page, 'scripts/shot-today-trends.png');
    // v0.7: 시간 맞춤 루틴
    await page.getByTestId('routine-card').getByRole('button', { name: '20분' }).click();
    ok((await page.locator('.routine-steps li').count()) >= 3, '20분 루틴 단계');
    await shotTall(page, 'scripts/shot-routine.png');
    await page.getByTestId('routine-start').click();
    ok(await seen(page.getByTestId('routine-bar')), '루틴 진행 막대');
    ok(await seen(page.locator('.tuner-display')), '루틴 1단계: 튜너로 이동');
    await page.getByTestId('routine-bar').getByRole('button', { name: '다음 단계' }).click();
    ok(await seen(page.locator('.routine-n', { hasText: '2/' })), '루틴 다음 단계');
    await page.screenshot({ path: 'scripts/shot-routine-bar.png' });
    page.once('dialog', (d) => d.accept());
    await page.getByTestId('routine-bar').getByRole('button', { name: '루틴 그만' }).click();
    ok(!(await seen(page.getByTestId('routine-bar'), 800)), '루틴 그만');
    await tab(page, '오늘');
    await page.getByRole('button', { name: '설정' }).click();
    ok(await seen(page.getByRole('dialog', { name: '설정' })), '설정 열기');
    await page.getByLabel('박 소리').selectOption('bass');
    await page.screenshot({ path: 'scripts/shot-settings.png' });
    ok(errors.length === 0, `콘솔 오류 없음 ${errors.slice(0, 3).join(' | ')}`);
    await browser.close();
  }
  // ── 2. 튜너 (가짜 마이크 = 5번 줄 A2) ──
  {
    const { browser, page, errors } = await launch('test-a2.wav');
    await page.getByTestId('level-1').click();
    await tab(page, '튜너');
    await page.getByRole('tablist').getByRole('button', { name: '튜너' }).click();
    await page.getByRole('button', { name: '🎤 마이크 켜기' }).click();
    ok(await seen(page.getByText('5번 줄 · A2'), 5000), '튜너: 5번 줄 A2');
    await page.waitForTimeout(1500);
    const cents = await page.locator('.cents-num').textContent();
    ok(Math.abs(num(cents)) <= 4, `튜너 센트 ${cents}`);
    await page.screenshot({ path: 'scripts/shot-tuner.png' });
    // 지판: 음 이름 맞히기 20문제 (정답 계산)
    await page.getByRole('tablist').getByRole('button', { name: '지판' }).click();
    await page.getByRole('button', { name: '음 이름 외우기' }).click();
    await page.getByTestId('fret-start').click();
    const OPEN = [40, 45, 50, 55, 59, 64], NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    let answered = 0;
    for (let i = 0; i < 20; i++) {
      const t = await page.getByTestId('fret-q').textContent({ timeout: 3000 }).catch(() => null);
      const m = /(\d)번 줄 (\d+)프렛/.exec(t ?? '');
      if (!m) break;
      const name = NAMES[(OPEN[6 - Number(m[1])] + Number(m[2])) % 12];
      await page.locator('.note-grid12').getByRole('button', { name, exact: true }).click();
      answered++;
      await page.waitForTimeout(800);
    }
    ok(await seen(page.getByTestId('fret-result'), 3000), `음 이름 20문제 끝 (${answered})`);
    ok(/20 \/ 20 맞음/.test(await page.getByTestId('fret-result').textContent()), '20문제 모두 맞음');
    await page.getByLabel(/자리별 정답률/).check();
    await shotTall(page, 'scripts/shot-fret-names.png');
    // 스케일: A 마이너 펜타토닉 1번 → 따라 치기 (가짜 마이크 A2 = 첫 음)
    await page.getByRole('button', { name: '스케일 모양' }).click();
    await page.getByRole('button', { name: '마이너 펜타토닉' }).click();
    await page.locator('.root-grid').getByRole('button', { name: 'A', exact: true }).click();
    await page.getByRole('button', { name: '1번', exact: true }).click();
    ok(await seen(page.getByText('(5~8프렛)')), 'A 마이너 펜타 1번 = 5~8프렛');
    ok((await page.locator('.fb-dot.root').count()) >= 3, '근음 점');
    await page.getByTestId('scale-follow').click();
    ok(await seen(page.getByText(/^2 \/ 23/), 6000), '스케일 따라 치기: 첫 음(A2) 맞아 다음 음으로');
    await shotTall(page, 'scripts/shot-scale.png');
    await page.getByRole('button', { name: '■ 그만' }).click();
    // 태블릿 가로
    await page.setViewportSize({ width: 1280, height: 800 });
    await tab(page, '핑거');
    await page.screenshot({ path: 'scripts/shot-tablet-finger.png' });
    ok(errors.length === 0, `콘솔 오류 없음 ${errors.slice(0, 3).join(' | ')}`);
    await browser.close();
  }
} catch (e) {
  console.error(e);
  ok(false, '예외: ' + e.message);
} finally {
  console.log(`PASS ${pass} FAIL ${fail}`);
  try { process.kill(-server.pid); } catch { /* 무시 */ }
  process.exit();
}
