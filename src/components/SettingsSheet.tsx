import { useState } from 'react';
import { useSettings } from '../state/settings';
import { LEVEL_NAMES, type Level } from '../data/settings';
import { TUNINGS } from '../guitar/tunings';
import { saveBackup, restoreBackup } from '../data/backup';
import { checkForUpdate } from '../state/appUpdate';
import { mic } from '../audio/mic';
import { resumeAudio } from '../audio/context';
import { micError } from '../state/useMic';

export function SettingsSheet({ onClose }: { onClose: () => void }) {
  const { settings, update } = useSettings();
  const [msg, setMsg] = useState<string | null>(null);
  const [cal, setCal] = useState<string | null>(null);

  async function calibrate() {
    setCal('스피커 소리를 키우고 조용히 기다려 주세요…');
    try { await mic.start(); } catch (e) { setCal(micError(e)); return; }
    const ctx = await resumeAudio();
    const t0 = ctx.currentTime + 0.6;
    const times = Array.from({ length: 8 }, (_, i) => t0 + i * 0.5);
    for (const t of times) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = 1000;
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 0.06);
    }
    const got: number[] = [];
    const off = mic.subscribeOnset((o) => {
      const raw = o.time + mic.inputLatency;
      const near = times.reduce((b, t) => (Math.abs(t - raw) < Math.abs(b - raw) ? t : b), times[0]);
      const d = raw - near;
      if (d > -0.05 && d < 0.4) got.push(d);
    });
    await new Promise((r) => setTimeout(r, (times[7] - ctx.currentTime + 0.8) * 1000));
    off(); mic.stop();
    if (got.length < 4) { setCal(`소리를 ${got.length}번밖에 못 들었어요. 스피커 소리를 키우고 다시 해 보세요.`); return; }
    const med = got.sort((a, b) => a - b)[got.length >> 1];
    const ms = Math.max(0, Math.round(med * 1000));
    update({ roundTripMs: ms });
    setCal(`${got.length}번 들었어요 · 지연 ${ms}ms 로 맞췄어요`);
  }

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet settings" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="설정">
        <div className="card-head"><b>설정</b><button className="mini" onClick={onClose}>닫기</button></div>
        <div className="row-setting col">
          <span>단계</span>
          <div className="segmented">{([1, 2, 3, 4] as Level[]).map((l) => <button key={l} className={settings.level === l ? 'on' : ''} onClick={() => update({ level: l })}>{LEVEL_NAMES[l]}</button>)}</div>
        </div>
        <div className="row-setting">
          <span>하루 목표</span>
          <button className="mini" onClick={() => update({ goalMin: Math.max(5, settings.goalMin - 5) })}>−</button>
          <b>{settings.goalMin}분</b>
          <button className="mini" onClick={() => update({ goalMin: Math.min(180, settings.goalMin + 5) })}>+</button>
        </div>
        <div className="row-setting">
          <span>조율</span>
          <select value={settings.tuningId} onChange={(e) => update({ tuningId: e.target.value })}>{TUNINGS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </div>
        <div className="row-setting">
          <span>기타 소리 크기</span>
          <input type="range" min={0.2} max={1.5} step={0.05} value={settings.synthVolume} onChange={(e) => update({ synthVolume: Number(e.target.value) })} />
        </div>
        <div className="row-setting">
          <span>마이크 민감도</span>
          <input type="range" min={35} max={75} step={1} value={-settings.minDb} onChange={(e) => update({ minDb: -Number(e.target.value) })} aria-label="마이크 민감도" />
          <span className="muted small">{-settings.minDb >= 60 ? '작은 소리도' : -settings.minDb <= 45 ? '큰 소리만' : '보통'}</span>
        </div>
        <label className="row-setting"><input type="checkbox" checked={settings.wakeLock} onChange={(e) => update({ wakeLock: e.target.checked })} /> 연습 중 화면 켜 두기</label>
        <div className="row-setting col">
          <span>따라 치기 박자 맞추기 (스피커 → 마이크 지연)</span>
          <div className="row-setting">
            <b>{settings.roundTripMs}ms</b>
            <button className="mini" onClick={() => update({ roundTripMs: Math.max(0, settings.roundTripMs - 10) })}>−10</button>
            <button className="mini" onClick={() => update({ roundTripMs: settings.roundTripMs + 10 })}>+10</button>
            <button className="secondary" onClick={calibrate}>자동으로 재기</button>
          </div>
          {cal && <span className="hint">{cal}</span>}
          <span className="hint">따라 치기에서 늘 늦거나 빠르게 나오면 맞춰 주세요. 이어폰이 아니라 스피커로 잴 때 정확해요.</span>
        </div>
        <div className="row-setting">
          <span>블루투스 이어폰 지연 (화면)</span>
          <input className="num" type="number" min={0} max={400} value={settings.latencyMs} onChange={(e) => update({ latencyMs: Math.max(0, Math.min(400, Number(e.target.value) || 0)) })} />ms
        </div>
        <h3>백업</h3>
        <div className="row-setting">
          <button className="secondary" onClick={() => saveBackup()}>백업 파일 저장</button>
          <label className="button secondary">
            백업에서 되돌리기
            <input type="file" accept="application/json,.json" hidden onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f || !confirm('지금 기록과 곡이 모두 백업 내용으로 바뀌어요. 계속할까요?')) return;
              try { const c = await restoreBackup(await f.text()); setMsg(`되돌렸어요: 곡 ${c.songs}개, 연습 기록 ${c.practice}개. 다시 열면 적용돼요.`); setTimeout(() => location.reload(), 1500); }
              catch (err) { setMsg(String((err as Error).message)); }
            }} />
          </label>
        </div>
        {msg && <p className="hint">{msg}</p>}
        <div className="row-setting small muted">
          <span>버전 {__APP_VERSION__}</span>
          <button className="mini" onClick={async () => setMsg((await checkForUpdate()) === 'checked' ? '새 버전을 확인했어요. 있으면 곧 바뀌어요.' : '이 환경에서는 확인할 수 없어요.')}>업데이트 확인</button>
        </div>
      </div>
    </div>
  );
}
