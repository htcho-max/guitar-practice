import type { Step } from '../finger/patterns';

export type SlotMark = 'ok' | 'wrong' | 'miss' | 'early' | 'late';

/** 패턴 한 마디를 탭으로 (위 줄 = 1번 줄) */
export function PatternBar({ chord, steps, sub, now, marks, compact }: {
  chord: string; steps: Step[]; sub: number; now?: number | null; marks?: (SlotMark | null)[]; compact?: boolean;
}) {
  const cw = compact ? 20 : 24, top = 22, gap = 13, padL = 8;
  const W = padL * 2 + steps.length * cw;
  const H = top + gap * 5 + 30;
  const y = (s: number) => top + (5 - s) * gap; // s: 0 = 6번 줄
  const x = (i: number) => padL + (i + 0.5) * cw;
  return (
    <svg className="tab-bar" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${chord} 마디 탭`}>
      <text x={padL} y={13} className="tab-chord">{chord}</text>
      {now !== null && now !== undefined && <rect x={x(now) - cw / 2} y={top - 8} width={cw} height={gap * 5 + 16} className="tab-now" />}
      {steps.map((_, i) => i % sub === 0 && <line key={i} x1={x(i)} x2={x(i)} y1={top - 6} y2={top - 2} className="tab-beat" />)}
      {Array.from({ length: 6 }, (_, s) => <line key={s} x1={padL} x2={W - padL} y1={y(s)} y2={y(s)} className="tab-line" />)}
      <line x1={W - padL} x2={W - padL} y1={y(5)} y2={y(0)} className="tab-barline" />
      {steps.map((st, i) => (
        <g key={i}>
          {st.notes.map((n) => (
            <g key={n.string}>
              <rect x={x(i) - 7} y={y(n.string) - 6} width={14} height={12} className="tab-num-bg" />
              <text x={x(i)} y={y(n.string) + 4} textAnchor="middle" className={`tab-num ${marks?.[i] ?? ''}`}>{n.fret}</text>
            </g>
          ))}
          {st.hit && <text x={x(i)} y={y(2.5) + 5} textAnchor="middle" className={`tab-hit ${marks?.[i] ?? ''}`}>✕</text>}
          <text x={x(i)} y={H - 12} textAnchor="middle" className="tab-finger">{st.roles.filter((r) => r !== 'x').map((r) => (r === 'p2' ? 'p' : r)).join('') || (st.hit ? '탁' : '')}</text>
          {marks?.[i] && <circle cx={x(i)} cy={H - 4} r={3} className={`tab-mark ${marks[i]}`} />}
        </g>
      ))}
    </svg>
  );
}
