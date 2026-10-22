import { useEffect, useState } from 'react';
import { TabBar } from './components/TabBar';
import { SettingsSheet } from './components/SettingsSheet';
import { Today } from './pages/Today';
import { TunerTab } from './pages/Tuner';
import { ChordsTab } from './pages/Chords';
import { FingerTab } from './pages/Finger';
import { SongsTab } from './pages/Songs';
import { useSettings } from './state/settings';
import { useBackLayer, setExitWarning, restoreGuard } from './state/back';
import { onNavigate, type TabId } from './state/navigate';
import { useMetronomeRunning } from './state/useMetronome';
import { metronome } from './audio/metronome';

const TITLES: Record<TabId, string> = { today: '오늘의 연습', chord: '코드', finger: '핑거스타일', song: '내 곡', tuner: '튜너 · 메트로놈' };

export function App({ updatedFrom = null }: { updatedFrom?: string | null }) {
  const [toast, setToast] = useState<string | null>(updatedFrom ? `새 버전으로 업데이트됐어요 · ${__APP_VERSION__}` : null);
  useEffect(() => { if (!toast) return; const id = setTimeout(() => setToast(null), 6000); return () => clearTimeout(id); }, [toast]);
  const [tab, setTab] = useState<TabId>(() => { try { return (localStorage.getItem('guitar-tab') as TabId) || 'today'; } catch { return 'today'; } });
  const [nav, setNav] = useState(0); // 같은 탭으로 다시 와도 새로 열리게
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { ready, settings } = useSettings();
  const metroOn = useMetronomeRunning();
  const go = (t: TabId) => { setTab(t); try { localStorage.setItem('guitar-tab', t); } catch { /* 무시 */ } };
  useBackLayer(tab !== 'today', () => go('today'));
  useBackLayer(settingsOpen, () => setSettingsOpen(false));
  useEffect(() => onNavigate((r) => { go(r.tab); setNav((n) => n + 1); }), []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setExitWarning(() => setToast('뒤로 버튼을 한 번 더 누르면 앱이 닫혀요'));
    const again = () => restoreGuard();
    window.addEventListener('pointerdown', again);
    return () => { setExitWarning(null); window.removeEventListener('pointerdown', again); };
  }, []);
  // 처음엔 단계 고르기
  const showTab = settings.level ? tab : 'today';

  return (
    <div className="app">
      <header className="topbar"><h1>{TITLES[showTab]}</h1>{showTab !== 'today' && <button className="mini" onClick={() => setSettingsOpen(true)} aria-label="설정">⚙</button>}</header>
      {metroOn && showTab !== 'tuner' && (
        <div className="statusbar"><span className="status-chip">메트로놈 {settings.bpm} <button className="mini" onClick={() => metronome.stop()} aria-label="메트로놈 정지">■</button></span></div>
      )}
      <main key={`${showTab}-${nav}`}>
        {!ready ? null : (
          <>
            {showTab === 'today' && <Today openSettings={() => setSettingsOpen(true)} />}
            {showTab === 'chord' && <ChordsTab />}
            {showTab === 'finger' && <FingerTab />}
            {showTab === 'song' && <SongsTab />}
            {showTab === 'tuner' && <TunerTab />}
          </>
        )}
      </main>
      {settings.level && <TabBar tab={showTab} onChange={go} />}
      {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} />}
      {toast && <div className="toast" role="status" onClick={() => setToast(null)}>{toast}</div>}
    </div>
  );
}
