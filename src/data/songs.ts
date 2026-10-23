import { db, type SongRow } from './db';
import { parseSong } from '../song/parse';

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/** 글에서 제목·가수 (머리말이 없으면 첫 줄) */
export function guessTitle(text: string, fallback = '새 곡'): { title: string; artist: string } {
  const { meta } = parseSong(text);
  if (meta.title) return { title: meta.title, artist: meta.artist };
  const first = text.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('{') && !/[|]/.test(l));
  return { title: (first ?? fallback).slice(0, 40), artist: meta.artist };
}

export async function addSong(text: string, fallbackTitle?: string): Promise<SongRow> {
  const { title, artist } = guessTitle(text, fallbackTitle);
  const now = Date.now();
  const row: SongRow = { id: newId(), title, artist, text, capo: null, transpose: 0, bpm: null, accomp: 'strum', folder: '', createdAt: now, updatedAt: now, openedAt: 0 };
  await db.songs.put(row);
  return row;
}

export async function saveSongText(id: string, text: string) {
  const { title, artist } = guessTitle(text);
  await db.songs.update(id, { text, title, artist, updatedAt: Date.now() });
}

/** 곡 지우기: 그 곡의 녹음·약한 마디 기록·복습함 항목도 함께 */
export async function deleteSongs(ids: string[]) {
  for (const id of ids) {
    await db.songs.delete(id).catch(() => {});
    await db.recordings.where('songId').equals(id).delete().catch(() => {});
    await db.kv.delete(`weak-bars:${id}`).catch(() => {});
    await db.reviews.filter((r) => r.key.startsWith(`song:${id}:`)).delete().catch(() => {});
  }
}
