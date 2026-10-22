import { useMemo, useState } from 'react';
import { realize, slots, toSeq, type Pattern, type Role } from '../finger/patterns';
import { countLabel, type StrumPattern } from '../strum/patterns';
import { shapesFor, shapeMidis } from '../guitar/chords';
import { STANDARD } from '../guitar/tunings';
import { PatternBar } from './TabBar6';
import { StrumBar } from './StrumBar';
import { saveFingerPattern, deleteFingerPattern, saveStrumPattern, deleteStrumPattern, newPatternId } from '../state/customPatterns';
import { Sequencer } from '../audio/sequencer';
import { synth } from '../audio/synth';
import { useBackLayer } from '../state/back';

const preview = new Sequencer<number>();
const ROWS: { role: Role; label: string }[] = [
  { role: 'a', label: 'a 약지 (1번 줄)' }, { role: 'm', label: 'm 중지 (2번 줄)' }, { role: 'i', label: 'i 검지 (3번 줄)' },
  { role: 'p2', label: 'p 엄지 교대 베이스' }, { role: 'p', label: 'p 엄지 근음' }, { role: 'x', label: '✕ 몸통 치기' },
];
const SUBS = [{ n: 1, t: '4분' }, { n: 2, t: '8분' }, { n: 3, t: '셋잇단' }, { n: 4, t: '16분' }];

function resize<T>(arr: T[], n: number, fill: () => T): T[] { return Array.from({ length: n }, (_, i) => arr[i] ?? fill()); }

/** 핑거 패턴 만들기: 칸(가로) × 손가락(세로) 눌러서 */
export function FingerPatternEditor({ initial, onClose }: { initial?: Pattern; onClose: (savedId?: string) => void }) {
  useBackLayer(true, () => onClose());
  const [name, setName] = useState(initial?.name ?? '내 패턴');
  const [beats, setBeats] = useState(initial?.beats ?? 4);
  const [sub, setSub] = useState(initial?.sub ?? 2);
  const [cells, setCells] = useState<Role[][]>(() => (initial ? slots(initial) as Role[][] : [['p'], ['i'], ['m'], ['a'], ['p2'], ['i'], ['m'], ['a']]));
  const [playing, setPlaying] = useState<number | null>(null);
  const n = beats * sub;
  const grid = resize(cells, n, () => [] as Role[]);
  const pattern: Pattern = { id: initial?.id ?? newPatternId('my'), name: name.trim() || '내 패턴', level: 1, beats, sub, seq: toSeq(grid), tip: '내가 만든 패턴', bpm: initial?.bpm ?? [60, 100], custom: true };
  const C = useMemo(() => shapesFor(0, '')[0], []);
  const steps = realize(pattern, C);
  const toggle = (slot: number, role: Role) => {
    const g = grid.map((c) => [...c]);
    const c = g[slot];
    if (c.includes(role)) g[slot] = c.filter((r) => r !== role);
    else {
      // 엄지는 한 번에 한 줄
      g[slot] = [...c.filter((r) => !((role === 'p' && r === 'p2') || (role === 'p2' && r === 'p'))), role];
    }
    setCells(g);
  };
  const listen = async () => {
    if (playing !== null) { preview.stop(); setPlaying(null); return; }
    await synth.ready();
    await preview.start(steps.map((st) => ({ beat: st.beat, data: st.slot, play: (_c, w) => { st.notes.forEach((x) => synth.note(x.midi, w, 0.75, x.string)); if (st.hit) synth.hit(w); } })), {
      bpm: 80, loopBeats: beats, meterBeats: beats, countIn: 0, click: false, onEvent: (e) => setPlaying(e.data!),
    });
    setPlaying(0);
  };
  const close = (id?: string) => { preview.stop(); synth.stopAll(); onClose(id); };
  const empty = grid.every((c) => !c.length);
  return (
    <div className="sheet-backdrop" onClick={() => close()}>
      <div className="sheet editor" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="핑거 패턴 만들기">
        <div className="card-head"><b>{initial ? '패턴 고치기' : '내 핑거 패턴 만들기'}</b><button className="mini" onClick={() => close()}>닫기</button></div>
        <input className="text" value={name} onChange={(e) => setName(e.target.value)} aria-label="패턴 이름" />
        <div className="row-setting small">
          <span>박</span>
          <div className="segmented small">{[2, 3, 4, 6].map((b) => <button key={b} className={beats === b ? 'on' : ''} onClick={() => setBeats(b)}>{b}</button>)}</div>
          <span>나눔</span>
          <div className="segmented small">{SUBS.map((x) => <button key={x.n} className={sub === x.n ? 'on' : ''} onClick={() => setSub(x.n)}>{x.t}</button>)}</div>
        </div>
        <div className="pe-grid-wrap">
          <table className="pe-grid">
            <thead><tr><th />{grid.map((_, i) => <th key={i} className={i % sub === 0 ? 'beat' : ''}>{countLabel(i, sub)}</th>)}</tr></thead>
            <tbody>
              {ROWS.map((r) => (
                <tr key={r.role}>
                  <th>{r.label}</th>
                  {grid.map((c, i) => (
                    <td key={i} className={`${i % sub === 0 ? 'beat' : ''} ${playing === i ? 'now' : ''}`}>
                      <button className={c.includes(r.role) ? 'on' : ''} onClick={() => toggle(i, r.role)} aria-label={`${countLabel(i, sub)} ${r.label}`}>{c.includes(r.role) ? (r.role === 'x' ? '✕' : '●') : ''}</button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <span className="muted small">C 코드로 보기 (실제로는 고른 코드에 맞춰 줄이 바뀌어요)</span>
        <div className="tab-wrap"><PatternBar chord="C" steps={steps} sub={sub} now={playing} /></div>
        <div className="row-setting">
          <button className="secondary" onClick={listen} disabled={empty}>{playing !== null ? '■ 멈춤' : '▶ 듣기'}</button>
          <button className="primary grow" disabled={empty} onClick={async () => { await saveFingerPattern(pattern); close(pattern.id); }}>저장</button>
          {initial && <button className="danger" onClick={async () => { if (confirm(`"${initial.name}" 을(를) 지울까요?`)) { await deleteFingerPattern(initial.id); close(); } }}>지우기</button>}
        </div>
      </div>
    </div>
  );
}

const CYCLE = ['-', 'D', 'U', 'x'];
/** 긁기 패턴 만들기: 칸을 누를 때마다 쉼 → ↓ → ↑ → ✕ */
export function StrumPatternEditor({ initial, onClose }: { initial?: StrumPattern; onClose: (savedId?: string) => void }) {
  useBackLayer(true, () => onClose());
  const [name, setName] = useState(initial?.name ?? '내 긁기');
  const [beats, setBeats] = useState(initial?.beats ?? 4);
  const [sub, setSub] = useState(initial?.sub ?? 2);
  const [seq, setSeq] = useState(initial?.seq ?? 'D-DU-UDU');
  const [playing, setPlaying] = useState<number | null>(null);
  const n = beats * sub;
  const s = seq.padEnd(n, '-').slice(0, n);
  const pattern: StrumPattern = { id: initial?.id ?? newPatternId('mys'), name: name.trim() || '내 긁기', level: 1, beats, sub, seq: s, tip: '내가 만든 긁기 패턴', bpm: initial?.bpm ?? [60, 100], custom: true };
  const G = useMemo(() => shapeMidis(shapesFor(7, '')[0], STANDARD.midi), []);
  const tap = (i: number) => { const c = s[i]; const nx = CYCLE[(CYCLE.indexOf(c) + 1) % CYCLE.length]; setSeq(s.slice(0, i) + nx + s.slice(i + 1)); };
  const listen = async () => {
    if (playing !== null) { preview.stop(); setPlaying(null); return; }
    await synth.ready();
    await preview.start([...s].map((c, i) => ({ beat: i / sub, data: i, play: (_x, w) => { if (c === 'D') synth.strum(G, w, 'down', 0.8); else if (c === 'U') synth.strum(G, w, 'up', 0.55); else if (c === 'x') synth.chuck(w); } })), {
      bpm: 80, loopBeats: beats, meterBeats: beats, countIn: 0, click: true, onEvent: (e) => setPlaying(e.data!),
    });
    setPlaying(0);
  };
  const close = (id?: string) => { preview.stop(); synth.stopAll(); onClose(id); };
  const empty = !/[DUx]/.test(s);
  return (
    <div className="sheet-backdrop" onClick={() => close()}>
      <div className="sheet editor" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="긁기 패턴 만들기">
        <div className="card-head"><b>{initial ? '긁기 패턴 고치기' : '내 긁기 패턴 만들기'}</b><button className="mini" onClick={() => close()}>닫기</button></div>
        <input className="text" value={name} onChange={(e) => setName(e.target.value)} aria-label="패턴 이름" />
        <div className="row-setting small">
          <span>박</span>
          <div className="segmented small">{[2, 3, 4, 6].map((b) => <button key={b} className={beats === b ? 'on' : ''} onClick={() => setBeats(b)}>{b}</button>)}</div>
          <span>나눔</span>
          <div className="segmented small">{SUBS.filter((x) => x.n > 1).map((x) => <button key={x.n} className={sub === x.n ? 'on' : ''} onClick={() => setSub(x.n)}>{x.t}</button>)}</div>
        </div>
        <p className="hint">칸을 누를 때마다 쉼 → ↓ 다운 → ↑ 업 → ✕ 뮤트</p>
        <div className="strum-edit" onClickCapture={(e) => { const el = (e.target as HTMLElement).closest('[data-i]'); if (el) tap(Number(el.getAttribute('data-i'))); }}>
          <StrumBar chord="G" pattern={pattern} now={playing} clickable />
        </div>
        <div className="row-setting">
          <button className="secondary" onClick={listen} disabled={empty}>{playing !== null ? '■ 멈춤' : '▶ 듣기'}</button>
          <button className="primary grow" disabled={empty} onClick={async () => { await saveStrumPattern(pattern); close(pattern.id); }}>저장</button>
          {initial && <button className="danger" onClick={async () => { if (confirm(`"${initial.name}" 을(를) 지울까요?`)) { await deleteStrumPattern(initial.id); close(); } }}>지우기</button>}
        </div>
      </div>
    </div>
  );
}
