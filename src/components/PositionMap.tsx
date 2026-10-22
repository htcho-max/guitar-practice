import { useMemo, useState } from 'react';
import { barPositions, findShifts, zoneOf, type PosEvent } from '../song/positions';

/** 마디마다 왼손 자리 + 크게 옮기는 곳 (누르면 그 두 마디 반복) */
export function PositionMap({ events, beatsPerBar, bars, onPractice }: { events: PosEvent[]; beatsPerBar: number; bars: number; onPractice?: (fromBeat: number, toBeat: number, label: string) => void }) {
  const [open, setOpen] = useState(false);
  const bp = useMemo(() => barPositions(events, beatsPerBar, bars), [events, beatsPerBar, bars]);
  const shifts = useMemo(() => findShifts(events, beatsPerBar), [events, beatsPerBar]);
  const maxPos = Math.max(0, ...bp.map((b) => b.hi));
  if (!events.length) return null;
  return (
    <div className="card pos-map" data-testid="pos-map">
      <button className="card-head link-like" onClick={() => setOpen(!open)}>
        <b>🗺 손 위치 지도</b><span className="muted small">가장 높이 {maxPos} · 큰 이동 {shifts.length}곳 {open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <>
          <div className="pos-strip">
            {bp.map((b) => (
              <span key={b.bar} className={`pos-cell ${zoneOf(b.pos)} ${shifts.some((s) => s.bar === b.bar) ? 'shift' : ''}`} title={`${b.bar + 1}마디 ${b.pos === null ? '개방' : `${b.lo}~${b.hi}프렛`}`}>
                <small>{b.bar + 1}</small><b>{b.pos ?? '·'}</b>
              </span>
            ))}
          </div>
          <p className="hint small">숫자 = 검지가 머무는 프렛 (초록 1~4 · 파랑 5~9 · 보라 10 이상). 빨간 테두리가 손을 크게 옮기는 마디예요.</p>
          {shifts.length > 0 && (
            <ul className="plain small shift-list">
              {shifts.map((s, i) => (
                <li key={i}>
                  <span>{s.bar + 1}마디: {s.from}프렛 → <b>{s.to}프렛</b> ({s.to > s.from ? '위로' : '아래로'} {Math.abs(s.to - s.from)}칸)</span>
                  {onPractice && <button className="mini" onClick={() => onPractice(Math.max(0, (s.bar - 1) * beatsPerBar), Math.min(bars, s.bar + 1) * beatsPerBar, `${Math.max(1, s.bar)}~${s.bar + 1}마디 이동`)}>이동 연습</button>}
                </li>
              ))}
            </ul>
          )}
          {shifts.length > 0 && <p className="hint small">이동 연습: 옮기기 전 마지막 음을 짧게 끊고, 엄지를 목 뒤에서 함께 미끄러뜨려요. 눈은 도착할 프렛 점을 먼저 봐요. 느리게 반복하다 박에 맞으면 템포가 올라가요.</p>}
        </>
      )}
    </div>
  );
}
