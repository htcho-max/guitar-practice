import { useEffect, useState } from 'react';
import { navigate } from './navigate';
import type { RoutineStep } from '../data/routine';

export interface RoutineRun { steps: RoutineStep[]; idx: number; endsAt: number; pausedLeft: number | null; dueAt: number | null }
let run: RoutineRun | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

export function getRoutine() { return run; }
export function startRoutine(steps: RoutineStep[]) {
  if (!steps.length) return;
  run = { steps, idx: 0, endsAt: Date.now() + steps[0].min * 60000, pausedLeft: null, dueAt: null };
  navigate(steps[0].nav);
  emit();
}
export function nextStep() {
  if (!run) return;
  const idx = run.idx + 1;
  if (idx >= run.steps.length) { run = null; emit(); navigate({ tab: 'today' }); return; }
  run = { ...run, idx, endsAt: Date.now() + run.steps[idx].min * 60000, pausedLeft: null, dueAt: null };
  navigate(run.steps[idx].nav);
  emit();
}
export function stopRoutine() { run = null; emit(); }
export function togglePause() {
  if (!run) return;
  run = run.pausedLeft !== null ? { ...run, endsAt: Date.now() + run.pausedLeft, pausedLeft: null } : { ...run, pausedLeft: Math.max(0, run.endsAt - Date.now()) };
  emit();
}
export function markDue(t: number) { if (run && run.dueAt === null) { run = { ...run, dueAt: t }; emit(); } }

/** 루틴 상태 + 1초마다 다시 그림 */
export function useRoutine(): { run: RoutineRun | null; left: number } {
  const [, set] = useState(0);
  useEffect(() => {
    const f = () => set((n) => n + 1);
    listeners.add(f);
    const id = setInterval(f, 1000);
    return () => { listeners.delete(f); clearInterval(id); };
  }, []);
  const left = run ? (run.pausedLeft ?? Math.max(0, run.endsAt - Date.now())) : 0;
  return { run, left };
}
