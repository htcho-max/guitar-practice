import { minFret, maxFret, shapeDegrees, shapeName, type ChordShape } from '../guitar/chords';
import { NOTE_NAMES } from '../audio/notes';
import { STANDARD } from '../guitar/tunings';

export type StringMark = 'ok' | 'bad' | 'mute' | 'now' | null;

/** 코드 그림 (세로: 줄은 세로선, 프렛은 가로선). 6번 줄이 왼쪽 */
export function ChordDiagram({ shape, labels = 'finger', width = 132, marks, tuning = STANDARD.midi, title = true, onString }: {
  shape: ChordShape;
  labels?: 'finger' | 'degree' | 'note';
  width?: number;
  marks?: StringMark[];
  tuning?: number[];
  title?: boolean;
  onString?: (s: number) => void;
}) {
  const lo = minFret(shape), hi = maxFret(shape);
  const base = hi <= 4 ? 1 : lo;
  const rows = Math.max(4, hi - base + 1);
  const W = 120, padX = 18, padTop = title ? 34 : 18, gapX = (W - 2 * padX) / 5, gapY = 22;
  const H = padTop + rows * gapY + 22;
  const x = (s: number) => padX + s * gapX;
  const y = (f: number) => padTop + (f - base + 0.5) * gapY;
  const deg = shapeDegrees(shape, tuning);
  const label = (s: number): string => {
    if (labels === 'degree') return deg[s] ?? '';
    if (labels === 'note') { const f = shape.frets[s]; return f === null ? '' : NOTE_NAMES[(tuning[s] + f) % 12]; }
    const f = shape.fingers[s];
    return f ? String(f) : '';
  };
  return (
    <svg className="chord-svg" viewBox={`0 0 ${W} ${H}`} width={width} role="img" aria-label={`${shapeName(shape)} 코드 그림`}>
      {title && <text x={W / 2} y={16} textAnchor="middle" className="cd-title">{shapeName(shape)}</text>}
      {base > 1 && <text x={2} y={padTop + gapY * 0.5 + 4} className="cd-base">{base}</text>}
      {/* 너트 / 프렛 */}
      <rect x={x(0)} y={padTop - (base === 1 ? 4 : 1)} width={x(5) - x(0)} height={base === 1 ? 5 : 1.5} className="cd-nut" />
      {Array.from({ length: rows }, (_, i) => <line key={i} x1={x(0)} x2={x(5)} y1={padTop + (i + 1) * gapY} y2={padTop + (i + 1) * gapY} className="cd-fret" />)}
      {Array.from({ length: 6 }, (_, s) => <line key={s} x1={x(s)} x2={x(s)} y1={padTop} y2={padTop + rows * gapY} className="cd-string" style={{ strokeWidth: 0.8 + (5 - s) * 0.22 }} />)}
      {/* 개방·뮤트 */}
      {shape.frets.map((f, s) => (f === 0 || f === null) && (
        <text key={s} x={x(s)} y={padTop - 7} textAnchor="middle" className={f === null ? 'cd-mute' : 'cd-open'}>{f === null ? '×' : '○'}</text>
      ))}
      {shape.barre && shape.barre.fret >= base && (
        <rect x={x(shape.barre.from) - 7} y={y(shape.barre.fret) - 7} width={x(shape.barre.to) - x(shape.barre.from) + 14} height={14} rx={7} className="cd-barre" />
      )}
      {shape.frets.map((f, s) => f !== null && f > 0 && (
        <g key={s}>
          <circle cx={x(s)} cy={y(f)} r={8} className={deg[s] === 'R' ? 'cd-dot root' : 'cd-dot'} />
          <text x={x(s)} y={y(f) + 3.6} textAnchor="middle" className="cd-dot-t">{label(s)}</text>
        </g>
      ))}
      {/* 아래: 도수·음 또는 줄 판정 */}
      {shape.frets.map((f, s) => {
        const m = marks?.[s];
        const t = m === 'ok' ? '✓' : m === 'bad' ? '!' : m === 'now' ? '▲' : labels === 'finger' && f !== null ? deg[s] ?? '' : '';
        return <text key={s} x={x(s)} y={H - 6} textAnchor="middle" className={`cd-under ${m ?? ''}`}>{t}</text>;
      })}
      {onString && Array.from({ length: 6 }, (_, s) => <rect key={s} x={x(s) - gapX / 2} y={padTop - 14} width={gapX} height={rows * gapY + 30} fill="transparent" onClick={() => onString(s)} />)}
    </svg>
  );
}
