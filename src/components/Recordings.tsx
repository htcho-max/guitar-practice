import { useEffect, useState } from 'react';
import { db, type RecordingRow } from '../data/db';

/** 곡의 내 녹음 목록: 듣기 · 내려받기 · 지우기 */
export function Recordings({ songId, tick }: { songId: string; tick: number }) {
  const [rows, setRows] = useState<RecordingRow[]>([]);
  const [urls, setUrls] = useState<Record<number, string>>({});
  const load = () => db.recordings.where('songId').equals(songId).toArray().then((r) => setRows(r.sort((a, b) => b.at - a.at))).catch(() => {});
  useEffect(() => { load(); }, [songId, tick]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { Object.values(urls).forEach((u) => URL.revokeObjectURL(u)); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!rows.length) return null;
  const urlOf = (r: RecordingRow) => {
    if (!urls[r.id!]) { const u = URL.createObjectURL(r.blob); setUrls((m) => ({ ...m, [r.id!]: u })); return u; }
    return urls[r.id!];
  };
  return (
    <div className="card">
      <div className="card-head"><b>내 녹음</b><span className="muted small">{rows.length}개 · 처음 것과 최근 것을 비교해 보세요</span></div>
      <ul className="rec-list">
        {rows.map((r, i) => (
          <li key={r.id}>
            <div className="rec-meta"><b>{r.date}</b> <span className="muted small">{r.label} · {Math.round(r.sec)}초{i === rows.length - 1 && rows.length > 1 ? ' · 처음' : i === 0 ? ' · 최근' : ''}</span></div>
            <audio controls preload="none" src={urlOf(r)} />
            <div className="row-setting small">
              <a className="link" href={urlOf(r)} download={`녹음-${r.date}-${r.id}.${r.mime.includes('mp4') ? 'm4a' : r.mime.includes('ogg') ? 'ogg' : 'webm'}`}>내려받기</a>
              <button className="link danger" onClick={async () => { if (confirm('이 녹음을 지울까요?')) { await db.recordings.delete(r.id!); load(); } }}>지우기</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
