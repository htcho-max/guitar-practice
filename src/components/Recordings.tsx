import { useEffect, useRef, useState } from 'react';
import { db, type RecordingRow } from '../data/db';
import { blobPeaks } from '../audio/peaks';

/** 파형 + 재생 위치 */
function Wave({ peaks, pos, onSeek, cls }: { peaks?: number[]; pos: number; onSeek?: (r: number) => void; cls?: string }) {
  const n = peaks?.length ?? 0;
  return (
    <svg className={`wave ${cls ?? ''}`} viewBox={`0 0 ${Math.max(n, 1)} 40`} preserveAspectRatio="none"
      onClick={(e) => { if (!onSeek) return; const r = e.currentTarget.getBoundingClientRect(); onSeek((e.clientX - r.left) / r.width); }}>
      {peaks?.map((p, i) => <rect key={i} x={i + 0.1} width={0.8} y={20 - Math.max(0.5, p * 19)} height={Math.max(1, p * 38)} className={i / n <= pos ? 'played' : ''} />)}
    </svg>
  );
}

/** 곡의 내 녹음: 파형, 듣기, A/B 비교, 이름 바꾸기, 내려받기, 지우기 */
export function Recordings({ songId, tick, onOverlay }: { songId: string; tick: number; onOverlay?: (r: RecordingRow) => void }) {
  const [rows, setRows] = useState<RecordingRow[]>([]);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const [pick, setPick] = useState<number[]>([]);
  const [pos, setPos] = useState<Record<number, number>>({});
  const audios = useRef<Record<number, HTMLAudioElement | null>>({});
  const load = () => db.recordings.where('songId').equals(songId).toArray().then((r) => setRows(r.sort((a, b) => b.at - a.at))).catch(() => {});
  useEffect(() => { load(); }, [songId, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { Object.values(urls).forEach((u) => URL.revokeObjectURL(u)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // 파형이 없으면 만들어 저장
  useEffect(() => {
    rows.filter((r) => !r.peaks).forEach(async (r) => {
      const p = await blobPeaks(r.blob);
      if (p) { await db.recordings.update(r.id!, { peaks: p }).catch(() => {}); setRows((cur) => cur.map((x) => (x.id === r.id ? { ...x, peaks: p } : x))); }
    });
  }, [rows.map((r) => r.id).join()]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows.length) return null;
  const urlOf = (r: RecordingRow) => {
    if (!urls[r.id!]) { const u = URL.createObjectURL(r.blob); setTimeout(() => setUrls((m) => ({ ...m, [r.id!]: u })), 0); return u; }
    return urls[r.id!];
  };
  const togglePick = (id: number) => setPick((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p.slice(-1), id]));
  const pauseAll = () => Object.values(audios.current).forEach((a) => a?.pause());
  const playOne = (id: number) => { const a = audios.current[id]; if (!a) return; if (!a.paused) { a.pause(); return; } pauseAll(); a.play().catch(() => {}); };
  /** 같은 자리(비율)에서 다른 녹음으로 바꿔 듣기 */
  const swap = () => {
    if (pick.length !== 2) return;
    const [a, b] = pick.map((id) => audios.current[id]);
    if (!a || !b) return;
    const from = !a.paused ? a : !b.paused ? b : a;
    const to = from === a ? b : a;
    const r = from.duration ? from.currentTime / from.duration : 0;
    from.pause();
    to.currentTime = (to.duration || 0) * r;
    to.play().catch(() => {});
  };
  const seek = (id: number, r: number) => { const a = audios.current[id]; if (a && a.duration) { a.currentTime = a.duration * r; setPos((p) => ({ ...p, [id]: r })); } };
  const picked = pick.map((id) => rows.find((r) => r.id === id)).filter(Boolean) as RecordingRow[];
  return (
    <div className="card">
      <div className="card-head"><b>내 녹음</b><span className="muted small">{rows.length}개 · 두 개를 골라 A/B 로 비교</span></div>
      {onOverlay && rows.some((r) => r.sync) && <p className="hint small">🎧 겹쳐 듣기: 왼쪽 = 내 연주, 오른쪽 = 앱 원곡. 이어폰으로 들으면 어디서 박이 밀리는지 바로 들려요.</p>}
      {picked.length === 2 && (
        <div className="ab-box" data-testid="ab-compare">
          {picked.map((r, k) => (
            <div key={r.id} className="ab-row">
              <button className="mini" onClick={() => playOne(r.id!)}>{k === 0 ? 'A' : 'B'} ▶</button>
              <Wave peaks={r.peaks} pos={pos[r.id!] ?? 0} onSeek={(x) => seek(r.id!, x)} cls={k === 0 ? 'a' : 'b'} />
              <span className="muted small">{r.date}</span>
            </div>
          ))}
          <button className="secondary" onClick={swap}>A ↔ B 같은 자리로 바꿔 듣기</button>
        </div>
      )}
      <ul className="rec-list">
        {rows.map((r, i) => (
          <li key={r.id}>
            <div className="rec-meta">
              <label className="small"><input type="checkbox" checked={pick.includes(r.id!)} onChange={() => togglePick(r.id!)} aria-label="비교할 녹음으로 고르기" /> </label>
              <b>{r.date}</b>
              <button className="link small" onClick={async () => { const t = prompt('녹음 이름', r.label); if (t !== null) { await db.recordings.update(r.id!, { label: t }); load(); } }}>{r.label}</button>
              <span className="muted small">· {Math.round(r.sec)}초{i === rows.length - 1 && rows.length > 1 ? ' · 처음' : i === 0 ? ' · 최근' : ''}</span>
            </div>
            <Wave peaks={r.peaks} pos={pos[r.id!] ?? 0} onSeek={(x) => seek(r.id!, x)} />
            <audio ref={(el) => { audios.current[r.id!] = el; }} controls preload="metadata" src={urlOf(r)}
              onTimeUpdate={(e) => { const a = e.currentTarget; if (a.duration) setPos((p) => ({ ...p, [r.id!]: a.currentTime / a.duration })); }} />
            <div className="row-setting small">
              {r.sync && onOverlay && <button className="link" onClick={() => { pauseAll(); onOverlay(r); }} data-testid="rec-overlay">🎧 원곡과 겹쳐 듣기</button>}
              <a className="link" href={urlOf(r)} download={`녹음-${r.date}-${r.id}.${r.mime.includes('mp4') ? 'm4a' : r.mime.includes('ogg') ? 'ogg' : 'webm'}`}>내려받기</a>
              <button className="link danger" onClick={async () => { if (confirm('이 녹음을 지울까요?')) { await db.recordings.delete(r.id!); setPick((p) => p.filter((x) => x !== r.id)); load(); } }}>지우기</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
