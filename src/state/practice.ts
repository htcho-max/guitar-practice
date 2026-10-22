import { useEffect, useRef } from 'react';
import { db, type PracticeKind } from '../data/db';
import { localDate } from '../data/dates';

const listeners = new Set<() => void>();
export function onPracticeSaved(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }

/** 연습 시간 더하기 (오늘·종류별) */
export async function addPractice(kind: PracticeKind, sec: number) {
  if (sec < 1) return;
  const date = localDate();
  const key = `${date}:${kind}`;
  try {
    await db.transaction('rw', db.practice, async () => {
      const row = await db.practice.get(key);
      await db.practice.put({ key, date, kind, sec: Math.round((row?.sec ?? 0) + sec) });
    });
    listeners.forEach((f) => f());
  } catch { /* 무시 */ }
}

/** active 인 동안 시간을 재서 30초마다·끝날 때 저장 */
export function usePracticeTimer(kind: PracticeKind, active: boolean) {
  const since = useRef<number | null>(null);
  useEffect(() => {
    if (!active) return;
    since.current = performance.now();
    const flush = () => {
      if (since.current === null) return;
      const now = performance.now();
      addPractice(kind, (now - since.current) / 1000);
      since.current = now;
    };
    const id = setInterval(flush, 30000);
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onHide); flush(); since.current = null; };
  }, [kind, active]);
}
