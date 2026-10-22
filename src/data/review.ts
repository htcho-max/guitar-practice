import { db, type ReviewRow } from './db';
import { localDate, addDays } from './dates';

/** 상자별 다음 복습까지 날 수 (상자 1 → 1일 … 상자 5 → 14일, 상자 5 에서 또 통과하면 졸업) */
export const BOX_DAYS = [0, 1, 2, 4, 7, 14];

export interface ReviewInput { key: string; kind: ReviewRow['kind']; label: string; nav: unknown; note: string }

/** 순수 계산: 지금 줄 → 결과 반영한 줄 (null = 없앰/안 넣음) */
export function nextReview(prev: ReviewRow | undefined, inp: ReviewInput, passed: boolean, today: string): ReviewRow | null {
  if (!prev) {
    if (passed) return null;
    return { ...inp, box: 1, due: addDays(today, BOX_DAYS[1]), added: today, last: today };
  }
  if (passed) {
    if (prev.last === today && prev.box > 1 && prev.due > today) return { ...prev, note: inp.note }; // 같은 날 두 번 올리지 않음
    const box = prev.box + 1;
    if (box > 5) return null; // 졸업
    return { ...prev, ...inp, box, due: addDays(today, BOX_DAYS[box]), last: today };
  }
  return { ...prev, ...inp, box: 1, due: addDays(today, BOX_DAYS[1]), last: today };
}

const listeners = new Set<() => void>();
export function onReviewChange(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function notifyReviews() { listeners.forEach((f) => f()); }

/** 연습 결과를 복습함에 반영 */
export async function recordReview(inp: ReviewInput, passed: boolean) {
  try {
    const today = localDate();
    const prev = await db.reviews.get(inp.key);
    const next = nextReview(prev, inp, passed, today);
    if (next) await db.reviews.put(next);
    else if (prev) await db.reviews.delete(inp.key);
    listeners.forEach((f) => f());
  } catch { /* 무시 */ }
}

export async function dueReviews(today = localDate()): Promise<ReviewRow[]> {
  try { return (await db.reviews.where('due').belowOrEqual(today).toArray()).sort((a, b) => a.box - b.box || a.due.localeCompare(b.due)); } catch { return []; }
}
export async function allReviews(): Promise<ReviewRow[]> {
  try { return await db.reviews.toArray(); } catch { return []; }
}

/** 단계별 1분 전환 목표 (번) */
export const CHANGE_TARGET: Record<1 | 2 | 3 | 4, number> = { 1: 30, 2: 40, 3: 50, 4: 60 };
