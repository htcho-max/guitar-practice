import type { PracticeRow, ChangeRow, FingerRun } from './db';
import { addDays } from './dates';

/** 날짜가 속한 주의 월요일 */
export function weekStart(date: string): string {
  const d = new Date(date + 'T12:00');
  const dow = (d.getDay() + 6) % 7; // 월=0
  return addDays(date, -dow);
}

/** 최근 n주 (오래된 주부터) 연습 분 */
export function weeklyMinutes(rows: PracticeRow[], today: string, n = 8): { week: string; min: number }[] {
  const w0 = weekStart(today);
  const weeks = Array.from({ length: n }, (_, i) => addDays(w0, -7 * (n - 1 - i)));
  const by = new Map(weeks.map((w) => [w, 0]));
  for (const r of rows) { const w = weekStart(r.date); if (by.has(w)) by.set(w, by.get(w)! + r.sec / 60); }
  return weeks.map((w) => ({ week: w, min: Math.round(by.get(w)!) }));
}

export interface Progress { label: string; first: number; best: number; last: number; unit: string; n: number }

/** 1분 전환: 쌍마다 처음 → 최고 */
export function changeProgress(rows: ChangeRow[]): Progress[] {
  const by = new Map<string, ChangeRow[]>();
  for (const r of rows) by.set(r.pair, [...(by.get(r.pair) ?? []), r]);
  return [...by.entries()].map(([pair, rs]) => {
    rs.sort((a, b) => a.at - b.at);
    return { label: pair.replace('|', ' ↔ '), first: rs[0].count, best: Math.max(...rs.map((r) => r.count)), last: rs[rs.length - 1].count, unit: '번', n: rs.length };
  }).sort((a, b) => b.n - a.n);
}

/** 패턴: 처음 템포 → 통과한 가장 빠른 템포 */
export function patternProgress(rows: FingerRun[], nameOf: (id: string) => string): Progress[] {
  const by = new Map<string, FingerRun[]>();
  for (const r of rows) by.set(r.patternId, [...(by.get(r.patternId) ?? []), r]);
  return [...by.entries()].map(([id, rs]) => {
    rs.sort((a, b) => a.at - b.at);
    const passed = rs.filter((r) => r.passed);
    return { label: nameOf(id), first: rs[0].bpm, best: passed.length ? Math.max(...passed.map((r) => r.bpm)) : 0, last: rs[rs.length - 1].bpm, unit: 'BPM', n: rs.length };
  }).sort((a, b) => b.n - a.n);
}
