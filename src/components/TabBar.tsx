import type { TabId } from '../state/navigate';
export const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'today', label: '오늘', icon: '◎' },
  { id: 'chord', label: '코드', icon: '▦' },
  { id: 'finger', label: '핑거', icon: '♪' },
  { id: 'song', label: '내 곡', icon: '♬' },
  { id: 'tuner', label: '튜너·지판', icon: '♮' },
];

export function TabBar({ tab, onChange }: { tab: TabId; onChange: (t: TabId) => void }) {
  return (
    <nav className="tabbar">
      {TABS.map((t) => (
        <button key={t.id} className={t.id === tab ? 'tab active' : 'tab'} onClick={() => onChange(t.id)} aria-current={t.id === tab}>
          <span className="tab-icon" aria-hidden>{t.icon}</span>
          <span>{t.label}</span>
        </button>
      ))}
    </nav>
  );
}
