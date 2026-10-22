import { useState } from 'react';
import type { Block, TabNote } from '../song/parse';
import { noteToken, renderTabRows, type TEvent } from '../song/tabtext';
import { durToken, DURS } from '../fingerstyle/melody';
import { useBackLayer } from '../state/back';

type Tab = Block & { kind: 'tab' };
type Tech = '' | 'harm' | 'art' | 'tap' | 'h' | 'p' | 'dead' | 'slap';
const TECHS: { v: Tech; t: string }[] = [
  { v: '', t: '보통' }, { v: 'h', t: '해머온' }, { v: 'p', t: '풀오프' }, { v: 'harm', t: '하모닉스 <>' }, { v: 'art', t: '인공 하모닉스 []' },
  { v: 'tap', t: '탭핑 t' }, { v: 'dead', t: '뮤트 x' }, { v: 'slap', t: '슬랩 S' },
];
const techOf = (n: TabNote): Tech => (n.slap ? 'slap' : n.dead ? 'dead' : n.harm ? 'harm' : n.art ? 'art' : n.tap ? 'tap' : n.tech === 'h' || n.tech === 'p' ? n.tech : '');
const DUR_OPTS = ['s', 'e', 'e.', 'q', 'q.', 'h', 'h.', 'w', 't', 'T'];
const durVal = (t: string) => DURS[t[0]] * (t.endsWith('.') ? 1.5 : 1);

/** 탭 한 묶음을 칸(사건)마다 눌러 고치기 */
export function TabEditor({ block, beatsPerBar, onSave }: { block: Tab; beatsPerBar: number; onSave: (rows: string[]) => void }) {
  const [events, setEvents] = useState<TEvent[]>(() => block.events.map((e) => ({ beat: e.beat, notes: e.notes.filter((n) => !(n.dead && !n.slap && e.notes.filter((x) => x.dead).length === 2 && n.string <= 1)), perc: e.notes.filter((n) => n.dead && !n.slap && n.string <= 1).length === 2 })));
  const [sel, setSel] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const total = () => Math.max(block.beats, Math.ceil(((events.at(-1)?.beat ?? 0) + 0.25) / beatsPerBar - 1e-6) * beatsPerBar);
  const durAt = (i: number) => (i + 1 < events.length ? events[i + 1].beat : total()) - events[i].beat;
  const apply = (next: TEvent[]) => { setEvents(next.sort((a, b) => a.beat - b.beat)); setDirty(true); };
  const bars = Math.round(total() / beatsPerBar);
  return (
    <div className="tab-edit">
      <div className="tab-edit-bars">
        {Array.from({ length: bars }, (_, m) => (
          <div key={m} className="te-bar">
            {events.map((e, i) => ({ e, i })).filter(({ e }) => e.beat >= m * beatsPerBar - 1e-6 && e.beat < (m + 1) * beatsPerBar - 1e-6).map(({ e, i }) => (
              <button key={i} className={`te-col ${sel === i ? 'on' : ''}`} onClick={() => setSel(i)} aria-label={`${m + 1}마디 ${(e.beat % beatsPerBar) + 1}박 칸`}>
                {[5, 4, 3, 2, 1, 0].map((s) => { const n = e.notes.find((x) => x.string === s); return <span key={s}>{n ? noteToken(n) : e.perc && s <= 1 ? 'x' : '·'}</span>; })}
                <small>{durToken(durAt(i)) ?? '?'}</small>
              </button>
            ))}
          </div>
        ))}
      </div>
      <div className="row-setting small">
        <span className="muted">칸을 눌러 고쳐요{dirty ? ' · 고친 곳 있음' : ''}</span>
        <button className="primary" disabled={!dirty} onClick={() => { onSave(renderTabRows(events, 0, total(), beatsPerBar)); setDirty(false); }} data-testid="tab-save">곡에 저장</button>
      </div>
      {sel !== null && events[sel] && (
        <EventSheet ev={events[sel]} dur={durAt(sel)} onClose={() => setSel(null)}
          onApply={(ev, dur) => {
            const next = events.map((x) => ({ ...x, notes: [...x.notes] }));
            next[sel] = { ...ev, beat: next[sel].beat };
            const delta = dur - durAt(sel);
            if (Math.abs(delta) > 1e-6) for (let k = sel + 1; k < next.length; k++) next[k].beat = Math.round((next[k].beat + delta) * 1000) / 1000;
            apply(next); setSel(null);
          }}
          onDelete={() => { apply(events.filter((_, k) => k !== sel)); setSel(null); }}
          onSplit={() => {
            const d = durAt(sel) / 2;
            if (!durToken(d)) return;
            apply([...events, { beat: Math.round((events[sel].beat + d) * 1000) / 1000, notes: events[sel].notes.map((n) => ({ ...n })), perc: events[sel].perc }]);
            setSel(null);
          }} />
      )}
    </div>
  );
}

function EventSheet({ ev, dur, onApply, onDelete, onSplit, onClose }: { ev: TEvent; dur: number; onApply: (e: TEvent, dur: number) => void; onDelete: () => void; onSplit: () => void; onClose: () => void }) {
  useBackLayer(true, onClose);
  const [rows, setRows] = useState(() => [5, 4, 3, 2, 1, 0].map((s) => { const n = ev.notes.find((x) => x.string === s); return { s, fret: n ? String(n.fret) : '', tech: n ? techOf(n) : ('' as Tech) }; }));
  const [perc, setPerc] = useState(!!ev.perc);
  const [d, setD] = useState(durToken(dur) ?? 'q');
  const build = (): TEvent => ({
    beat: ev.beat, perc,
    notes: rows.filter((r) => r.fret !== '' || r.tech === 'dead' || r.tech === 'slap').map((r): TabNote => {
      const fret = Math.max(0, Math.min(24, Number(r.fret) || 0));
      const n: TabNote = { string: r.s, fret };
      if (r.tech === 'harm') n.harm = true;
      if (r.tech === 'art') n.art = true;
      if (r.tech === 'tap') n.tap = true;
      if (r.tech === 'h' || r.tech === 'p') n.tech = r.tech;
      if (r.tech === 'dead') { n.dead = true; n.fret = 0; }
      if (r.tech === 'slap') { n.dead = true; n.slap = true; n.fret = 0; }
      return n;
    }),
  });
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="탭 칸 고치기">
        <div className="card-head"><b>칸 고치기 · {Math.floor(ev.beat) + 1}박째</b><button className="mini" onClick={onClose}>닫기</button></div>
        {rows.map((r, k) => (
          <div key={r.s} className="row-setting small te-row">
            <span>{6 - r.s}번 줄</span>
            <input className="num" inputMode="numeric" value={r.fret} placeholder="—" aria-label={`${6 - r.s}번 줄 프렛`}
              onChange={(e) => setRows((x) => x.map((y, j) => (j === k ? { ...y, fret: e.target.value.replace(/\D/g, '').slice(0, 2) } : y)))} />
            <select value={r.tech} onChange={(e) => setRows((x) => x.map((y, j) => (j === k ? { ...y, tech: e.target.value as Tech } : y)))} aria-label={`${6 - r.s}번 줄 기법`}>
              {TECHS.map((t) => <option key={t.v} value={t.v}>{t.t}</option>)}
            </select>
          </div>
        ))}
        <label className="row-setting small"><input type="checkbox" checked={perc} onChange={(e) => setPerc(e.target.checked)} /> 몸통 치기 (5·6번 줄 x)</label>
        <div className="row-setting small"><span>길이</span>
          <select value={d} onChange={(e) => setD(e.target.value)}>{DUR_OPTS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
          <span className="muted">바꾸면 뒤 칸들이 밀려요</span>
        </div>
        <div className="row-setting">
          <button className="primary grow" onClick={() => onApply(build(), durVal(d))} data-testid="te-apply">적용</button>
          <button className="secondary" onClick={onSplit}>둘로 나누기</button>
          <button className="danger" onClick={onDelete}>칸 지우기</button>
        </div>
      </div>
    </div>
  );
}
