import type { FsEvent, Arrangement } from '../fingerstyle/arrange';

export type FsMark = 'ok' | 'wrong' | 'miss' | 'early' | 'late';

/** 핑거스타일 편곡을 마디마다 탭으로: 멜로디는 진하게(주황), 베이스 보통, 채우기 흐리게 */
export function FsBars({ arr, now, marks, hide }: { arr: Arrangement; now?: number | null; marks?: Map<number, FsMark>; hide?: Set<string> }) {
  const bars = arr.beats / arr.beatsPerBar;
  return (
    <div className="tab-wrap fs-wrap">
      {Array.from({ length: bars }, (_, m) => {
        const from = m * arr.beatsPerBar;
        const evs = arr.events.filter((e) => e.beat >= from - 1e-6 && e.beat < from + arr.beatsPerBar - 1e-6);
        return <FsBar key={m} events={evs} from={from} beats={arr.beatsPerBar} chords={arr.chords.filter((c) => c.beat >= from - 1e-6 && c.beat < from + arr.beatsPerBar - 1e-6)} now={now} marks={marks} hide={hide} n={m + 1} />;
      })}
    </div>
  );
}

function FsBar({ events, from, beats, chords, now, marks, hide, n }: { events: FsEvent[]; from: number; beats: number; chords: { beat: number; name: string }[]; now?: number | null; marks?: Map<number, FsMark>; hide?: Set<string>; n: number }) {
  const bw = 44, padL = 10, top = 24, gap = 12;
  const W = padL * 2 + beats * bw;
  const H = top + gap * 5 + 18;
  const x = (b: number) => padL + (b - from) * bw + 10;
  const y = (s: number) => top + (5 - s) * gap;
  return (
    <svg className="tab-bar fs-bar" viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${n}마디`}>
      <text x={2} y={10} className="fs-n">{n}</text>
      {chords.map((c) => <text key={c.beat} x={x(c.beat) - 6} y={12} className="tab-chord">{c.name}</text>)}
      {Array.from({ length: beats }, (_, i) => <line key={i} x1={x(from + i)} x2={x(from + i)} y1={top - 7} y2={top - 3} className="tab-beat" />)}
      {Array.from({ length: 6 }, (_, s) => <line key={s} x1={padL} x2={W - padL} y1={y(s)} y2={y(s)} className="tab-line" />)}
      <line x1={W - padL} x2={W - padL} y1={y(5)} y2={y(0)} className="tab-barline" />
      {events.map((e) => (
        <g key={e.beat}>
          {now !== null && now !== undefined && Math.abs(now - e.beat) < 1e-6 && <rect x={x(e.beat) - 9} y={top - 8} width={18} height={gap * 5 + 16} rx={4} className="tab-now" />}
          {e.notes.map((nt) => (hide?.has(nt.voice) ? null : (
            <g key={nt.string}>
              <rect x={x(e.beat) - 7} y={y(nt.string) - 6} width={14} height={12} className="tab-num-bg" />
              <text x={x(e.beat)} y={y(nt.string) + 4} textAnchor="middle" className={`tab-num fs-${nt.voice}`}>{nt.fret}</text>
            </g>
          )))}
          {marks?.get(e.beat) && <circle cx={x(e.beat)} cy={H - 6} r={3} className={`tab-mark ${marks.get(e.beat)}`} />}
        </g>
      ))}
    </svg>
  );
}
