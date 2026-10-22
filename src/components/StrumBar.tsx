import { countLabel, type StrumPattern } from '../strum/patterns';
import type { SlotMark } from './TabBar6';

/** 긁기 패턴 한 마디: 칸마다 ↓ ↑ ✕, 아래에 1 & 2 & */
export function StrumBar({ chord, pattern, now, marks }: { chord: string; pattern: StrumPattern; now?: number | null; marks?: (SlotMark | null)[] }) {
  return (
    <div className="strum-bar" role="img" aria-label={`${chord} 긁기 ${pattern.seq}`}>
      <div className="strum-chord">{chord}</div>
      <div className="strum-cells" style={{ gridTemplateColumns: `repeat(${pattern.seq.length}, 1fr)` }}>
        {[...pattern.seq].map((c, i) => (
          <div key={i} className={`strum-cell ${i % pattern.sub === 0 ? 'beat' : ''} ${now === i ? 'now' : ''} ${marks?.[i] ?? ''}`}>
            <span className={`strum-arrow ${({ D: 'down', U: 'up', x: 'mute' } as Record<string, string>)[c] ?? 'rest'}`}>{c === 'D' ? '↓' : c === 'U' ? '↑' : c === 'x' ? '✕' : '·'}</span>
            <small>{countLabel(i, pattern.sub)}</small>
          </div>
        ))}
      </div>
    </div>
  );
}
