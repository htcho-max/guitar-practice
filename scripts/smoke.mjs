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

    // 핑거: 들어 보기 → 따라 치기 (가짜 마이크 소리로 결과까지)
    await tab(page, '핑거');
    ok(await seen(page.locator('svg.tab-bar')), '핑거 탭 그림');
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
    await page.getByRole('button', { name: /예시 곡 3개 넣기/ }).click();
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
    // 새 곡 붙여 넣기
    await page.getByRole('button', { name: '＋ 새 곡' }).click();
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
    await page.getByRole('button', { name: '설정' }).click();
    ok(await seen(page.getByRole('dialog', { name: '설정' })), '설정 열기');
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
