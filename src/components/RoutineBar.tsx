import { useEffect } from 'react';
import { useRoutine, nextStep, stopRoutine, togglePause, markDue } from '../state/routine';
import { busyFlags } from '../state/busy';
import { synth } from '../audio/synth';

const mmss = (ms: number) => { const s = Math.ceil(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** 루틴 진행 막대: 남은 시간, 다음, 멈춤. 시간이 되면 종소리 → 연주 중이 아니면 5초 뒤 다음으로 */
export function RoutineBar() {
  const { run, left } = useRoutine();
  const timeUp = !!run && run.pausedLeft === null && left <= 0;
  useEffect(() => {
    if (!timeUp || !run || run.dueAt !== null) return;
    markDue(Date.now());
    synth.ready().then((c) => { synth.harm(76, c.currentTime + 0.02, 0.6); synth.harm(83, c.currentTime + 0.35, 0.5); }).catch(() => {});
  }, [timeUp, run]);
  useEffect(() => {
    if (!timeUp || !run?.dueAt) return;
    if (Date.now() - run.dueAt >= 5000 && busyFlags.size === 0) nextStep();
  });
  if (!run) return null;
  const st = run.steps[run.idx];
  const nextT = run.steps[run.idx + 1]?.title;
  return (
    <div className={`routine-bar ${timeUp ? 'due' : ''}`} data-testid="routine-bar">
      <span className="routine-n">{run.idx + 1}/{run.steps.length}</span>
      <span className="grow routine-t"><b>{st.title}</b><small className="muted">{timeUp ? (busyFlags.size ? '시간 됐어요 — 연주를 멈추면 넘어가요' : `시간 됐어요 → ${nextT ?? '끝'}`) : nextT ? `다음: ${nextT}` : '마지막'}</small></span>
      <b className="routine-time">{timeUp ? '⏰' : mmss(left)}</b>
      <button className="mini" onClick={togglePause} aria-label={run.pausedLeft !== null ? '계속' : '잠깐 멈춤'}>{run.pausedLeft !== null ? '▶' : '❚❚'}</button>
      <button className="mini" onClick={nextStep} aria-label="다음 단계">{run.idx + 1 < run.steps.length ? '다음' : '끝'}</button>
      <button className="mini" onClick={() => { if (confirm('루틴을 그만할까요?')) stopRoutine(); }} aria-label="루틴 그만">✕</button>
    </div>
  );
}
