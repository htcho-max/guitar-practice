import { db } from './db';

const TABLES = ['practice', 'changes', 'fingerRuns', 'songs', 'kv'] as const; // 녹음은 크기 때문에 백업에서 뺌
export interface Backup { app: 'guitar-practice'; version: 1; exportedAt: string; tables: Record<string, unknown[]> }

export async function makeBackup(): Promise<Blob> {
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) tables[t] = await (db as unknown as Record<string, { toArray: () => Promise<unknown[]> }>)[t].toArray();
  const data: Backup = { app: 'guitar-practice', version: 1, exportedAt: new Date().toISOString(), tables };
  return new Blob([JSON.stringify(data)], { type: 'application/json' });
}

export async function saveBackup() {
  const blob = await makeBackup();
  const name = `guitar-practice-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([blob], name, { type: 'application/json' });
  const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
  if (nav.canShare?.({ files: [file] }) && /Android|iPhone|iPad/i.test(navigator.userAgent)) {
    try { await nav.share({ files: [file], title: '기타 연습 백업' }); return; } catch { /* 취소하면 내려받기 */ }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** 지금 기록을 모두 지우고 백업 내용으로 */
export async function restoreBackup(text: string): Promise<Record<string, number>> {
  const data = JSON.parse(text) as Partial<Backup>;
  if (data.app !== 'guitar-practice' || !data.tables) throw new Error('기타 연습 도우미 백업 파일이 아니에요.');
  const counts: Record<string, number> = {};
  await db.transaction('rw', [db.practice, db.changes, db.fingerRuns, db.songs, db.kv], async () => {
    for (const t of TABLES) {
      const rows = data.tables![t] ?? [];
      const table = (db as unknown as Record<string, { clear: () => Promise<void>; bulkPut: (r: unknown[]) => Promise<unknown> }>)[t];
      await table.clear();
      if (rows.length) await table.bulkPut(rows);
      counts[t] = rows.length;
    }
  });
  return counts;
}

export async function requestPersist() {
  try { await navigator.storage?.persist?.(); } catch { /* 무시 */ }
}
