/** 센트 바늘 (−50 ~ +50) */
export function CentsGauge({ cents, good = 5 }: { cents: number | null; good?: number }) {
  const c = cents === null ? 0 : Math.max(-50, Math.min(50, cents));
  const cls = cents === null ? '' : Math.abs(cents) <= good ? 'gauge-good' : Math.abs(cents) <= 15 ? 'gauge-warn' : 'gauge-bad';
  return (
    <div className={`gauge ${cls}`}>
      <svg viewBox="-50 0 100 20" preserveAspectRatio="none" className="gauge-svg" aria-hidden>
        <rect x={-15} y={0} width={30} height={20} className="gauge-warn-zone" />
        <rect x={-good} y={0} width={good * 2} height={20} className="gauge-good-zone" />
        {[-40, -30, -20, -10, 10, 20, 30, 40].map((t) => <line key={t} x1={t} x2={t} y1={14} y2={20} className="gauge-tick" />)}
        <line x1={0} x2={0} y1={0} y2={20} className="gauge-center" />
        {cents !== null && <rect x={c - 1.2} y={1} width={2.4} height={18} rx={1} className="gauge-needle" />}
      </svg>
      <div className="gauge-scale"><span>♭ 낮음</span><span>0</span><span>높음 ♯</span></div>
    </div>
  );
}
