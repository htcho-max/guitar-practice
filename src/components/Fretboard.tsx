import { useEffect, useRef } from 'react';
import { stringNo } from '../guitar/tunings';
import { NOTE_NAMES } from '../audio/notes';

export interface FbDot { string: number; fret: number; label?: string; cls?: string }

/** 가로 지판 (위 줄 = 1번 줄). 0프렛(개방)은 너트 왼쪽 */
export function Fretboard({ maxFret = 12, dots, onTap, tuning, box, hlString, heat }: {
  maxFret?: number;
  dots: FbDot[];
  onTap?: (s: number, f: number) => void;
  tuning: number[];
  /** 박스(포지션) 프렛 범위 강조 */
  box?: [number, number] | null;
  hlString?: number | null;
  /** 자리마다 0~1 (낮을수록 약함) — 색칠 */
  heat?: Record<string, number>;
}) {
  const fw = 46, gap = 26, left = 64, top = 16;
  const scroller = useRef<HTMLDivElement>(null);
  const boxKey = box ? box.join('-') : '';
  // 박스가 보이게 옆으로 밀기
  useEffect(() => {
    const el = scroller.current;
    if (!el || !box) return;
    const x0 = box[0] <= 1 ? 0 : left + (box[0] - 1.5) * fw;
    el.scrollTo({ left: Math.max(0, x0 - 8), behavior: 'smooth' });
  }, [boxKey]); // eslint-disable-line react-hooks/exhaustive-deps
  const W = left + maxFret * fw + 12;
  const H = top + gap * 5 + 30;
  const x = (f: number) => (f === 0 ? left - 18 : left + (f - 0.5) * fw);
  const y = (s: number) => top + (5 - s) * gap;
  const marks = [3, 5, 7, 9, 15, 17].filter((f) => f <= maxFret);
  return (
    <div className="fb-scroll" ref={scroller}>
      <svg className="fb-svg" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label="기타 지판">
        <rect x={left} y={top - 8} width={maxFret * fw} height={gap * 5 + 16} rx={4} className="fb-wood" />
        {box && <rect x={box[0] === 0 ? left - 34 : left + (box[0] - 1) * fw} y={top - 10} width={(box[1] - Math.max(box[0], 1) + 1) * fw + (box[0] === 0 ? 34 : 0)} height={gap * 5 + 20} rx={8} className="fb-box" />}
        {marks.map((f) => <circle key={f} cx={left + (f - 0.5) * fw} cy={top + gap * 2.5} r={5} className="fb-inlay" />)}
        {maxFret >= 12 && [1.5, 3.5].map((k) => <circle key={k} cx={left + 11.5 * fw} cy={top + gap * k} r={5} className="fb-inlay" />)}
        {heat && Object.entries(heat).map(([k, v]) => {
          const [s, f] = k.split(':').map(Number);
          if (f > maxFret) return null;
          return <rect key={k} x={x(f) - 20} y={y(s) - 11} width={40} height={22} rx={6} className={v >= 0.85 ? 'fb-heat good' : 'fb-heat'} style={{ opacity: v >= 0.85 ? 0.35 : 0.25 + (1 - v) * 0.6 }} />;
        })}
        <rect x={left - 4} y={top - 8} width={5} height={gap * 5 + 16} className="fb-nut" />
        {Array.from({ length: maxFret }, (_, i) => <line key={i} x1={left + (i + 1) * fw} x2={left + (i + 1) * fw} y1={top - 8} y2={top + gap * 5 + 8} className="fb-fret" />)}
        {Array.from({ length: 6 }, (_, s) => (
          <g key={s}>
            <line x1={left - 30} x2={W - 12} y1={y(s)} y2={y(s)} className={`fb-string ${hlString === s ? 'hl' : ''}`} style={{ strokeWidth: 0.9 + s * 0.35 }} />
            <text x={4} y={y(s) + 4} className="fb-sname">{stringNo(s)} {NOTE_NAMES[tuning[s] % 12]}</text>
          </g>
        ))}
        {Array.from({ length: maxFret }, (_, i) => <text key={i} x={left + (i + 0.5) * fw} y={H - 4} textAnchor="middle" className="fb-fnum">{i + 1}</text>)}
        {onTap && Array.from({ length: 6 }, (_, s) => Array.from({ length: maxFret + 1 }, (_, f) => (
          <rect key={`${s}-${f}`} x={x(f) - (f === 0 ? 16 : fw / 2)} y={y(s) - gap / 2} width={f === 0 ? 32 : fw} height={gap} fill="transparent" onClick={() => onTap(s, f)} />
        )))}
        {dots.map((d, i) => (
          <g key={i} className={`fb-dot ${d.cls ?? ''}`} pointerEvents="none">
            <circle cx={x(d.fret)} cy={y(d.string)} r={11} />
            {d.label && <text x={x(d.fret)} y={y(d.string) + 4} textAnchor="middle">{d.label}</text>}
          </g>
        ))}
      </svg>
    </div>
  );
}
