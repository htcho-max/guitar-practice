import Dexie, { type Table } from 'dexie';

/** 하루·종류별 연습 시간 (key = 날짜:종류) */
export type PracticeKind = 'tuner' | 'metronome' | 'chord' | 'change' | 'strum' | 'finger' | 'song' | 'fretboard';
export interface PracticeRow { key: string; date: string; kind: PracticeKind; sec: number }
/** 1분 전환 기록 */
export interface ChangeRow { id?: number; pair: string; count: number; date: string; at: number; auto: boolean }
/** 핑거 패턴 따라 치기 기록 */
export interface FingerRun {
  id?: number; patternId: string; chords: string; bpm: number;
  hitRate: number; pitchRate: number; meanMs: number; sdMs: number; passed: boolean; date: string; at: number;
}
export interface SongRow {
  id: string; title: string; artist: string; text: string;
  /** 지금 쓰는 카포 (곡에 적힌 카포와 다를 수 있음) */
  capo: number | null;
  transpose: number; bpm: number | null;
  accomp: 'strum' | 'finger' | 'once' | 'none';
  folder: string;
  createdAt: number; updatedAt: number; openedAt: number;
}
export interface KvRow { key: string; value: unknown }
/** 복습함: 약했던 연습을 간격을 늘려 가며 다시 (라이트너 상자 1~5) */
export interface ReviewRow {
  key: string;
  kind: 'change' | 'finger' | 'strum' | 'song' | 'chord' | 'fret' | 'scale';
  label: string;
  /** 누르면 갈 곳 (NavRequest) */
  nav: unknown;
  box: number;
  due: string;
  added: string;
  last: string;
  /** 마지막 결과 한 줄 */
  note: string;
}
/** 내 연주 녹음 */
export interface RecordingRow { id?: number; songId: string; label: string; date: string; at: number; sec: number; mime: string; blob: Blob; /** 파형 (0~1, 160개) — 처음 볼 때 만들어 둠 */ peaks?: number[] }

class GuitarDB extends Dexie {
  practice!: Table<PracticeRow, string>;
  changes!: Table<ChangeRow, number>;
  fingerRuns!: Table<FingerRun, number>;
  songs!: Table<SongRow, string>;
  kv!: Table<KvRow, string>;
  recordings!: Table<RecordingRow, number>;
  reviews!: Table<ReviewRow, string>;
  constructor(name = 'guitar-practice') {
    super(name);
    this.version(1).stores({
      practice: 'key, date, kind',
      changes: '++id, pair, date',
      fingerRuns: '++id, patternId, date',
      songs: 'id, title, updatedAt, openedAt',
      kv: 'key',
    });
    this.version(2).stores({ recordings: '++id, songId, at' });
    this.version(3).stores({ reviews: 'key, due, kind' });
  }
}

export const db = new GuitarDB();

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  try { const r = await db.kv.get(key); return (r?.value as T) ?? fallback; } catch { return fallback; }
}
export async function kvSet(key: string, value: unknown) {
  try { await db.kv.put({ key, value }); } catch { /* 무시 */ }
}
