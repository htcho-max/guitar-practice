import { useEffect, useMemo, useRef, useState } from 'react';
import { CHANGE_PAIRS, chordPcs, shapeMidis, type ChordShape } from '../guitar/chords';
import { parseChord, shapeForSymbol } from '../guitar/symbols';
import { tuningById } from '../guitar/tunings';
import { ChordDiagram } from '../components/ChordDiagram';
import { useSettings } from '../state/settings';
import { Sequencer } from '../audio/sequencer';
import { synth } from '../audio/synth';
import { mic } from '../audio/mic';
import { chordTemplate, cosine } from '../audio/chroma';
import { useMic } from '../state/useMic';
import { usePracticeTimer } from '../state/practice';
import { useWakeLock } from '../state/wakeLock';
import { setBusy } from '../state/busy';
import { db, type ChangeRow } from '../data/db';
import { localDate } from '../data/dates';
import { clampBpm } from '../audio/schedule';
import { recordReview, CHANGE_TARGET } from '../data/review';

const seq = new Sequencer<number>();

function shapeOf(name: string, tuning?: number[]): ChordShape | null {
  const c = parseChord(name);
  return c ? shapeForSymbol(c, 0, tuning) : null;
}

export function ChangePractice({ initialPair }: { initialPair?: [string, string] }) {
  const { settings } = useSettings();
  const level = settings.level ?? 1;
  const [pair, setPair] = useState<[string, string]>(() => initialPair ?? (JSON.parse(localStorage.getItem('guitar-change-pair') ?? 'null') as [string, string] | null) ?? CHANGE_PAIRS[level][0]);
  const [mode, setMode] = useState<'beat' | 'minute'>(() => (localStorage.getItem('guitar-change-mode') as 'beat' | 'minute') || 'minute');
  const [custom, setCustom] = useState('');
  useEffect(() => { try { localStorage.setItem('guitar-change-pair', JSON.stringify(pair)); localStorage.setItem('guitar-change-mode', mode); } catch { /* 무시 */ } }, [pair, mode]);
  const tuningMidi = tuningById(settings.tuningId).midi;
  const shapes = pair.map((n) => shapeOf(n, tuningMidi));
  const bad = shapes.some((s) => !s);
  const applyCustom = () => {
    const names = custom.split(/[\s,→>-]+/).filter(Boolean);
    if (names.length >= 2 && names.every((n) => shapeOf(n))) { setPair([names[0], names[1]]); setCustom(''); }
  };
  return (
    <>
      <div className="card">
        <div className="card-head"><b>바꿀 두 코드</b></div>
        <div className="chips">
          {CHANGE_PAIRS[level].map(([a, b]) => {
            const on = a === pair[0] && b === pair[1];
            return <button key={a + b} className={on ? 'chip on' : 'chip'} onClick={() => setPair([a, b])}>{a} ↔ {b}</button>;
          })}
        </div>
        <div className="row-setting">
          <input className="text" placeholder="직접: 예) G Bm" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applyCustom(); }} />
          <button className="mini" onClick={applyCustom}>바꾸기</button>
        </div>
        {custom && custom.split(/[\s,]+/).filter(Boolean).some((n) => !shapeOf(n)) && <p className="hint">모르는 코드 이름이 있어요.</p>}
      </div>
      <div className="segmented">
        <button className={mode === 'minute' ? 'on' : ''} onClick={() => setMode('minute')}>1분 전환</button>
        <button className={mode === 'beat' ? 'on' : ''} onClick={() => setMode('beat')}>박자 맞춰 바꾸기</button>
      </div>
      {bad ? <p className="error">코드 모양을 찾을 수 없어요.</p> : mode === 'minute'
        ? <MinuteChanges pair={pair} shapes={shapes as ChordShape[]} />
        : <BeatChanges pair={pair} shapes={shapes as ChordShape[]} />}
    </>
  );
}

/** 1분 동안 몇 번 바꾸는지 (마이크로 자동 세기 + 손으로 +1) */
function MinuteChanges({ pair, shapes }: { pair: [string, string]; shapes: ChordShape[] }) {
  const { settings } = useSettings();
  const key = pair.join('|');
  const [left, setLeft] = useState<number | null>(null);
  const [count, setCount] = useState(0);
  const [cur, setCur] = useState<0 | 1 | null>(null);
  const [auto, setAuto] = useState(true);
  const [history, setHistory] = useState<ChangeRow[]>([]);
  const [saved, setSaved] = useState<number | null>(null);
  const { start: micStart, stop: micStop, error } = useMic({ reading: false });
  const running = left !== null && left > 0;
  usePracticeTimer('change', running);
  useWakeLock(running, settings.wakeLock);
  useEffect(() => { setBusy('change', running); return () => setBusy('change', false); }, [running]);
  const load = () => db.changes.where('pair').equals(key).toArray().then((r) => setHistory(r.sort((a, b) => b.at - a.at))).catch(() => {});
  useEffect(() => { load(); setSaved(null); setCount(0); setLeft(null); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const best = history.reduce((m, r) => Math.max(m, r.count), 0);
  const countRef = useRef(0);
  countRef.current = count;

  // 시계
  useEffect(() => {
    if (!running) return;
    const end = performance.now() + left! * 1000;
    const id = setInterval(() => {
      const l = Math.max(0, Math.ceil((end - performance.now()) / 1000));
      setLeft(l);
      if (l <= 0) clearInterval(id);
    }, 200);
    return () => clearInterval(id);
  }, [running]); // eslint-disable-line react-hooks/exhaustive-deps

  // 끝: 저장
  useEffect(() => {
    if (left !== 0) return;
    micStop();
    synth.ready().then((ctx) => synth.chuck(ctx.currentTime));
    const row: ChangeRow = { pair: key, count: countRef.current, date: localDate(), at: Date.now(), auto };
    db.changes.add(row).then(load).catch(() => {});
    const target = CHANGE_TARGET[settings.level ?? 1];
    recordReview({ key: `change:${key}`, kind: 'change', label: `1분 전환 ${pair[0]} ↔ ${pair[1]}`, nav: { tab: 'chord', mode: 'change', pair }, note: `${countRef.current}번 (목표 ${target})` }, countRef.current >= target);
    setSaved(countRef.current);
    setCur(null);
  }, [left]); // eslint-disable-line react-hooks/exhaustive-deps

  // 자동 세기: 0.12초마다 두 코드 중 어느 쪽에 가까운지 (두 번 연속 같으면 확정)
  useEffect(() => {
    if (!running || !auto) return;
    const tpls = shapes.map((s) => chordTemplate(chordPcs(s.root, s.suffix), s.bass));
    let last: 0 | 1 | null = null, cand: 0 | 1 | null = null, n = 0;
    const id = setInterval(() => {
      const c = mic.chroma();
      if (!c || mic.level() < settings.minDb + 8) return;
      const s = tpls.map((t) => cosine(c, t));
      const k: 0 | 1 = s[0] >= s[1] ? 0 : 1;
      if (Math.max(...s) < 0.78 || Math.abs(s[0] - s[1]) < 0.04) { cand = null; n = 0; return; }
      if (k === cand) n++; else { cand = k; n = 1; }
      if (n >= 2 && k !== last) {
        if (last !== null) setCount((x) => x + 1);
        last = k;
        setCur(k);
      }
    }, 120);
    return () => clearInterval(id);
  }, [running, auto, key]); // eslint-disable-line react-hooks/exhaustive-deps

  const begin = async () => {
    setCount(0); setSaved(null); setCur(null);
    if (auto && !(await micStart())) return;
    setLeft(60);
  };
  const stopEarly = () => { setLeft(null); micStop(); setCur(null); };

  return (
    <div className="card">
      <div className="change-pair">
        {shapes.map((s, i) => (
          <div key={i} className={`change-shape ${cur === i ? 'on' : ''}`}>
            <ChordDiagram shape={s} labels={settings.chordLabels} width={140} tuning={tuningById(settings.tuningId).midi} />
          </div>
        ))}
      </div>
      <div className="minute-face">
        <div className="minute-count" data-testid="change-count">{count}<small>번</small></div>
        <div className="muted">{running ? `${left}초 남음` : saved !== null ? `끝! ${saved}번 ${saved > 0 && saved >= best ? '· 최고 기록' : ''}` : '60초 동안 두 코드를 오가며 몇 번 바꾸는지 세요'}</div>
      </div>
      {!running ? (
        <>
          <button className="primary big" onClick={begin}>▶ 1분 시작</button>
          <label className="row-setting small"><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> 마이크로 자동 세기 (바꿀 때마다 한 번 긁기)</label>
        </>
      ) : (
        <div className="row-setting">
          <button className="primary big grow" onClick={() => setCount((c) => c + 1)}>+1</button>
          <button className="secondary" onClick={stopEarly}>그만</button>
        </div>
      )}
      {error && <p className="error">{error}</p>}
      <p className="hint">자동 세기가 놓치면 +1 을 누르세요. 손가락을 한꺼번에 옮기는 연습이에요 — 소리가 깨끗하지 않아도 괜찮아요.</p>
      {history.length > 0 && (
        <div className="small">
          <b>기록</b> · 최고 {best}번
          <div className="spark">{history.slice(0, 12).reverse().map((r) => <span key={r.id} style={{ height: `${Math.max(8, (r.count / Math.max(best, 1)) * 100)}%` }} title={`${r.date} ${r.count}번`} />)}</div>
          <span className="muted">최근 {history.slice(0, 5).map((r) => r.count).join(' · ')}</span>
        </div>
      )}
    </div>
  );
}

/** 메트로놈에 맞춰 마디마다 (또는 2박·1박마다) 바꾸기 */
function BeatChanges({ pair, shapes }: { pair: [string, string]; shapes: ChordShape[] }) {
  const { settings, update } = useSettings();
  const tuning = tuningById(settings.tuningId).midi;
  const [per, setPer] = useState(4);
  const [sound, setSound] = useState(true);
  const [cur, setCur] = useState<number | null>(null);
  const [beat, setBeat] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const bpm = settings.bpm;
  usePracticeTimer('change', playing);
  useWakeLock(playing, settings.wakeLock);
  useEffect(() => { setBusy('change-beat', playing); return () => setBusy('change-beat', false); }, [playing]);
  useEffect(() => () => { seq.stop(); synth.stopAll(); }, []);
  const events = useMemo(() => [0, 1].map((i) => ({
    beat: i * per,
    data: i,
    play: sound ? (_ctx: AudioContext, when: number) => synth.strum(shapeMidis(shapes[i], tuning), when, 'down', 0.7) : undefined,
  })), [per, sound, shapes, tuning]);
  const start = async () => {
    await synth.ready();
    await seq.start(events, {
      bpm, loopBeats: per * 2, meterBeats: Math.min(4, per * 2), countIn: Math.min(4, per * 2), click: true,
      clickSound: settings.clickSound, clickVolume: settings.clickVolume,
      onEvent: (e) => setCur(e.data as number),
      onBeat: (b) => setBeat(b),
    });
    setPlaying(true);
  };
  const stop = () => { seq.stop(); synth.stopAll(); setPlaying(false); setCur(null); setBeat(null); };
  useEffect(() => { if (playing) { stop(); } }, [per, sound, bpm, pair.join()]); // eslint-disable-line react-hooks/exhaustive-deps
  const nowIdx = cur ?? 0;
  const meterN = Math.min(4, per * 2);
  return (
    <div className="card">
      <div className="change-big">
        <ChordDiagram shape={shapes[nowIdx]} labels={settings.chordLabels} width={200} tuning={tuning} />
        <div className="change-next">
          <span className="muted small">다음</span>
          <ChordDiagram shape={shapes[1 - nowIdx]} labels={settings.chordLabels} width={110} tuning={tuning} />
        </div>
      </div>
      <div className="beats">{Array.from({ length: meterN }, (_, i) => <span key={i} className={`dot ${beat !== null && ((beat % meterN) + meterN) % meterN === i ? (beat < 0 ? 'on beat' : 'on') : ''}`} />)}</div>
      <div className="muted small center">{playing && beat !== null && beat < 0 ? `준비… ${-beat}` : '\u00a0'}</div>
      <div className="row-setting">
        <span>템포</span>
        <button className="mini" onClick={() => update({ bpm: clampBpm(bpm - 5) })}>−5</button>
        <b>{bpm}</b>
        <button className="mini" onClick={() => update({ bpm: clampBpm(bpm + 5) })}>+5</button>
      </div>
      <div className="row-setting">
        <span>바꾸는 간격</span>
        <div className="segmented small grow">
          {[4, 2, 1].map((n) => <button key={n} className={per === n ? 'on' : ''} onClick={() => setPer(n)}>{n === 4 ? '한 마디' : `${n}박`}</button>)}
        </div>
      </div>
      <label className="row-setting small"><input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} /> 바꿀 때 기타 소리도 (끄면 클릭만)</label>
      <button className={`primary big ${playing ? 'stop' : ''}`} onClick={() => (playing ? stop() : start())}>{playing ? '■ 정지' : '▶ 시작'}</button>
      <p className="hint">한 마디에 맞추기가 쉬워지면 2박, 1박으로. 다음 코드를 미리 보고 손가락을 마지막 박에 떼기 시작하세요.</p>
    </div>
  );
}
