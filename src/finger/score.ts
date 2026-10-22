import { matchesNotes } from '../audio/onset';

export interface Expected { time: number; pcs: number[]; hit: boolean; /** 화면 표시용 (몇 번째 칸) */ slot: number; lap: number }
export interface Heard { time: number; chroma: number[] }
export interface StepResult { exp: Expected; heard: Heard | null; devMs: number | null; pitchOk: boolean | null }
export interface RunResult {
  steps: StepResult[];
  extra: Heard[];
  hitRate: number;
  pitchRate: number;
  /** 평균 어긋남 (ms, + 늦음) */
  meanMs: number;
  /** 흔들림 (표준편차 ms) */
  sdMs: number;
  /** 칸별 놓친 비율 (여러 바퀴 합) */
  weakSlots: { slot: number; miss: number; total: number }[];
}

/**
 * 기대한 음과 들린 소리 맞추기. 각 기대 음에 창(±window) 안의 가장 가까운 소리 하나.
 * window 는 칸 간격의 45% (최대 150ms)
 */
export function matchRun(exp: Expected[], heard: Heard[], stepSec: number): RunResult {
  const win = Math.min(0.15, stepSec * 0.45);
  const used = new Set<number>();
  const steps: StepResult[] = exp.map((e) => {
    let bi = -1, bd = Infinity;
    heard.forEach((h, i) => {
      if (used.has(i)) return;
      const d = Math.abs(h.time - e.time);
      if (d <= win && d < bd) { bd = d; bi = i; }
    });
    if (bi < 0) return { exp: e, heard: null, devMs: null, pitchOk: null };
    used.add(bi);
    const h = heard[bi];
    return { exp: e, heard: h, devMs: (h.time - e.time) * 1000, pitchOk: e.hit || !e.pcs.length ? null : matchesNotes(h.chroma, e.pcs) };
  });
  const extra = heard.filter((_, i) => !used.has(i));
  const hits = steps.filter((s) => s.heard);
  const devs = hits.map((s) => s.devMs!);
  const mean = devs.length ? devs.reduce((a, b) => a + b, 0) / devs.length : 0;
  const sd = devs.length ? Math.sqrt(devs.reduce((a, b) => a + (b - mean) ** 2, 0) / devs.length) : 0;
  const pitched = hits.filter((s) => s.pitchOk !== null);
  const bySlot = new Map<number, { miss: number; total: number }>();
  for (const s of steps) {
    const v = bySlot.get(s.exp.slot) ?? { miss: 0, total: 0 };
    v.total++;
    if (!s.heard || s.pitchOk === false) v.miss++;
    bySlot.set(s.exp.slot, v);
  }
  return {
    steps, extra,
    hitRate: exp.length ? hits.length / exp.length : 0,
    pitchRate: pitched.length ? pitched.filter((s) => s.pitchOk).length / pitched.length : 1,
    meanMs: mean, sdMs: sd,
    weakSlots: [...bySlot.entries()].map(([slot, v]) => ({ slot, ...v })).filter((v) => v.miss > 0).sort((a, b) => b.miss / b.total - a.miss / a.total),
  };
}

/** 템포 사다리: 두 번 연속 통과(놓침 ≤10%, 음 ≥85%, 흔들림 ≤35ms)하면 +4 BPM */
export function passed(r: RunResult): boolean {
  return r.hitRate >= 0.9 && r.pitchRate >= 0.85 && r.sdMs <= 35;
}
