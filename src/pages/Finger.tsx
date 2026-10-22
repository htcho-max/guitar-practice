import { useEffect, useMemo, useRef, useState } from 'react';
import { allPatterns, PROGRESSIONS, patternById, realize, type Pattern, type Step } from '../finger/patterns';
import { FingerPatternEditor } from '../components/PatternEditors';
import { useCustomVersion } from '../state/customPatterns';
import { matchRun, passed, type Expected, type Heard, type RunResult } from '../finger/score';
import { parseChord, shapeForSymbol } from '../guitar/symbols';
import { tuningById } from '../guitar/tunings';
import { PatternBar, type SlotMark } from '../components/TabBar6';
import { Sequencer, type SeqEvent } from '../audio/sequencer';
import { synth } from '../audio/synth';
import { mic } from '../audio/mic';
import { useMic } from '../state/useMic';
import { useSettings } from '../state/settings';
import { usePracticeTimer } from '../state/practice';
import { useWakeLock } from '../state/wakeLock';
import { setBusy } from '../state/busy';
import { takeRequest } from '../state/navigate';
import { db, kvGet, kvSet, type FingerRun } from '../data/db';
import { localDate } from '../data/dates';
import { clampBpm } from '../audio/schedule';
import { LEVEL_NAMES, type Level } from '../data/settings';
import { recordReview } from '../data/review';
import { FingerstylePractice } from './Fingerstyle';
import { TechniquePractice } from './Technique';

type Pos = { bar: number; slot: number };
const seq = new Sequencer<Pos>();

export function FingerTab() {
  const req = useMemo(() => takeRequest('finger'), []);
  type M = 'arp' | 'fs' | 'tech';
  const [mode, setMode] = useState<M>(() => req?.mode ?? (localStorage.getItem('guitar-finger-mode') as M) ?? 'fs');
  const pick = (m: M) => { setMode(m); try { localStorage.setItem('guitar-finger-mode', m); } catch { /* 무시 */ } };
  if (req?.tuneId) { try { localStorage.setItem('guitar-fs-tune', req.tuneId); if (req.style) localStorage.setItem('guitar-fs-style', String(req.style)); } catch { /* 무시 */ } }
  return (
    <div className="page">
      <div className="segmented">
        <button className={mode === 'fs' ? 'on' : ''} onClick={() => pick('fs')}>핑거스타일</button>
        <button className={mode === 'arp' ? 'on' : ''} onClick={() => pick('arp')}>아르페지오</button>
        <button className={mode === 'tech' ? 'on' : ''} onClick={() => pick('tech')}>기법</button>
      </div>
      {mode === 'fs' ? <FingerstylePractice /> : mode === 'tech' ? <TechniquePractice /> : <ArpeggioPractice req={req} />}
    </div>
  );
}

function ArpeggioPractice({ req }: { req: ReturnType<typeof takeRequest<'finger'>> }) {
  const { settings, update } = useSettings();
  const tuning = tuningById(settings.tuningId).midi;
  const [pid, setPid] = useState(req?.patternId ?? localStorage.getItem('guitar-finger-pattern') ?? (settings.level === 3 ? 'travis' : 'pima'));
  const [chords, setChords] = useState<string[]>(req?.chords ?? JSON.parse(localStorage.getItem('guitar-finger-chords') ?? '["C","Am"]'));
  const [ladder, setLadder] = useState<Record<string, { bpm: number; streak: number }>>({});
  const [custom, setCustom] = useState('');
  const [editing, setEditing] = useState<Pattern | 'new' | null>(null);
  useCustomVersion();
  const pattern = patternById(pid);
  const bpmState = ladder[pid]?.bpm ?? pattern.bpm[0];
  useEffect(() => { kvGet('finger-ladder', {}).then(setLadder); }, []);
  useEffect(() => { try { localStorage.setItem('guitar-finger-pattern', pid); localStorage.setItem('guitar-finger-chords', JSON.stringify(chords)); } catch { /* 무시 */ } }, [pid, chords]);
  const setBpm = (b: number) => { const n = { ...ladder, [pid]: { bpm: clampBpm(b), streak: 0 } }; setLadder(n); kvSet('finger-ladder', n); };
  const bars = useMemo(() => chords.map((name) => {
    const c = parseChord(name);
    const shape = c ? shapeForSymbol(c, 0, tuning) : null;
    return { chord: name, steps: shape ? realize(pattern, shape, tuning) : [] as Step[] };
  }), [chords, pattern, tuning]);
  const level = (settings.level ?? 1) as Level;
  const applyCustom = () => {
    const names = custom.split(/[\s,|]+/).filter(Boolean);
    if (names.length && names.every((n) => { const c = parseChord(n); return c && shapeForSymbol(c); })) { setChords(names.slice(0, 8)); setCustom(''); }
  };

  return (
    <>
      <div className="card">
        <div className="card-head"><b>아르페지오 패턴</b>
          <select value={level} onChange={(e) => update({ level: Number(e.target.value) as Level })} aria-label="단계">
            {([1, 2, 3, 4] as Level[]).map((l) => <option key={l} value={l}>{LEVEL_NAMES[l]}</option>)}
          </select>
        </div>
        <div className="chips">
          {allPatterns().filter((p) => p.custom || p.level <= level).map((p) => (
            <button key={p.id} className={`${p.id === pid ? 'chip on' : 'chip'} ${p.custom ? 'mine' : ''}`} onClick={() => setPid(p.id)}>
              {p.name}{p.level === level && level > 1 && !p.custom ? ' ★' : ''}
            </button>
          ))}
          <button className="chip mine" onClick={() => setEditing('new')} data-testid="finger-new">＋ 내 패턴</button>
        </div>
        <p className="hint">아르페지오: 코드 음을 정해진 손가락 순서로 뜯는 반주예요. 멜로디를 함께 치는 연습은 위 "핑거스타일"에서. {pattern.tip}{pattern.custom && <> · <button className="link small" onClick={() => setEditing(pattern)}>고치기</button></>}</p>
        {editing && <FingerPatternEditor initial={editing === 'new' ? undefined : editing} onClose={(id) => { setEditing(null); if (id) setPid(id); else if (!allPatterns().some((p) => p.id === pid)) setPid('pima'); }} />}
      </div>
      <div className="card">
        <div className="card-head"><b>코드 진행</b><span className="muted small">한 코드 = 한 마디</span></div>
        <div className="chips">
          {PROGRESSIONS.filter((p) => p.level <= level).map((p) => {
            const k = p.chords.join(' ');
            return <button key={k} className={k === chords.join(' ') ? 'chip on' : 'chip'} onClick={() => setChords(p.chords)}>{p.chords.join(' – ')}</button>;
          })}
        </div>
        <div className="row-setting">
          <input className="text" placeholder="직접: 예) G D Em C" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') applyCustom(); }} />
          <button className="mini" onClick={applyCustom}>바꾸기</button>
        </div>
      </div>
      <PatternPlayer pattern={pattern} bars={bars} bpm={bpmState} setBpm={setBpm}
        onResult={(r) => {
          const prev = ladder[pid] ?? { bpm: bpmState, streak: 0 };
          const ok = passed(r);
          let next = { bpm: prev.bpm, streak: ok ? prev.streak + 1 : 0 };
          if (next.streak >= 2) next = { bpm: clampBpm(prev.bpm + 4), streak: 0 };
          const n = { ...ladder, [pid]: next };
          setLadder(n); kvSet('finger-ladder', n);
          const row: FingerRun = { patternId: pid, chords: chords.join(' '), bpm: bpmState, hitRate: r.hitRate, pitchRate: r.pitchRate, meanMs: r.meanMs, sdMs: r.sdMs, passed: ok, date: localDate(), at: Date.now() };
          db.fingerRuns.add(row).catch(() => {});
          recordReview({ key: `finger:${pid}:${chords.join(' ')}`, kind: 'finger', label: `핑거 ${pattern.name} · ${chords.join(' ')}`, nav: { tab: 'finger', patternId: pid, chords }, note: `${bpmState} BPM · 친 음 ${Math.round(r.hitRate * 100)}%` }, ok);
          return { ok, up: next.bpm > prev.bpm, streak: next.streak };
        }} ladderStreak={ladder[pid]?.streak ?? 0} />
    </>
  );
}

function PatternPlayer({ pattern, bars, bpm, setBpm, onResult, ladderStreak }: {
  pattern: Pattern; bars: { chord: string; steps: Step[] }[]; bpm: number; setBpm: (b: number) => void;
  onResult: (r: RunResult) => { ok: boolean; up: boolean; streak: number }; ladderStreak: number;
}) {
  const { settings } = useSettings();
  const [mode, setMode] = useState<'idle' | 'listen' | 'follow'>('idle');
  const [now, setNow] = useState<Pos | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [result, setResult] = useState<{ r: RunResult; ok: boolean; up: boolean; streak: number; reps: number } | null>(null);
  const [reps, setReps] = useState(2);
  const { start: micStart, stop: micStop, error } = useMic({ reading: false });
  const heard = useRef<Heard[]>([]);
  const playing = mode !== 'idle';
  usePracticeTimer('finger', playing);
  useWakeLock(playing, settings.wakeLock);
  useEffect(() => { setBusy('finger', playing); return () => setBusy('finger', false); }, [playing]);
  useEffect(() => () => { seq.stop(); synth.stopAll(); }, []);
  const barBeats = pattern.beats;
  const key = pattern.id + bars.map((b) => b.chord).join() + bpm;
  useEffect(() => { stop(); setResult(null); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const events = (withSound: boolean, times: number): SeqEvent<Pos>[] => {
    const out: SeqEvent<Pos>[] = [];
    for (let r = 0; r < times; r++) bars.forEach((b, bi) => b.steps.forEach((st) => {
      const beat = (r * bars.length + bi) * barBeats + st.beat;
      out.push({
        beat, data: { bar: bi, slot: st.slot },
        play: withSound ? (_c, when) => {
          st.notes.forEach((n) => synth.note(n.midi, when, st.slot === 0 ? 0.85 : 0.7, n.string));
          if (st.hit) synth.hit(when);
        } : undefined,
      });
    }));
    return out;
  };

  async function listen() {
    setResult(null);
    await synth.ready();
    await seq.start(events(true, 1), {
      bpm, loopBeats: bars.length * barBeats, meterBeats: barBeats, countIn: 0, click: false,
      onEvent: (e) => setNow(e.data!),
    });
    setMode('listen');
  }

  async function follow() {
    setResult(null);
    if (!(await micStart())) return;
    heard.current = [];
    const total = bars.length * reps * barBeats;
    const evs = events(false, reps);
    const offOnset = mic.subscribeOnset((o) => heard.current.push({ time: o.time, chroma: o.chroma }));
    await seq.start(evs, {
      bpm, endBeats: total, meterBeats: barBeats, countIn: barBeats, click: true,
      clickSound: settings.clickSound, clickVolume: settings.clickVolume,
      onEvent: (e) => setNow(e.data!),
      onBeat: (b) => setCount(b < 0 ? -b : null),
      onEnd: () => {
        // 마지막 음이 들어오도록 조금 기다렸다가 채점
        setTimeout(() => {
          offOnset();
          micStop();
          const exp: Expected[] = [];
          for (let r = 0; r < reps; r++) bars.forEach((b, bi) => b.steps.forEach((st) => {
            if (!st.notes.length && !st.hit) return;
            exp.push({ time: seq.timeOf((r * bars.length + bi) * barBeats + st.beat), pcs: [...new Set(st.notes.map((n) => n.midi % 12))], hit: st.hit, slot: bi * 1000 + st.slot, lap: r });
          }));
          const first = exp[0]?.time ?? 0;
          const res = matchRun(exp, heard.current.filter((h) => h.time > first - 0.3), 60 / bpm / pattern.sub);
          const o = onResult(res);
          setResult({ r: res, ...o, reps });
          setMode('idle'); setNow(null); setCount(null);
        }, 400);
      },
    });
    setMode('follow');
  }

  function stop() {
    seq.stop(); synth.stopAll(); micStop();
    setMode('idle'); setNow(null); setCount(null);
  }

  // 결과 표시: 마지막 바퀴 기준 칸 색
  const marksFor = (bi: number): (SlotMark | null)[] | undefined => {
    if (!result) return undefined;
    const steps = bars[bi].steps;
    return steps.map((st) => {
      const rs = result.r.steps.filter((s) => s.exp.slot === bi * 1000 + st.slot);
      if (!rs.length) return null;
      const miss = rs.filter((s) => !s.heard).length, wrong = rs.filter((s) => s.pitchOk === false).length;
      if (miss * 2 >= rs.length) return 'miss';
      if (wrong * 2 >= rs.length) return 'wrong';
      const devs = rs.filter((s) => s.devMs !== null).map((s) => s.devMs!);
      const m = devs.reduce((a, b) => a + b, 0) / Math.max(1, devs.length);
      return m > 45 ? 'late' : m < -45 ? 'early' : 'ok';
    });
  };

  return (
    <div className="card">
      <div className="tab-wrap">
        {bars.map((b, bi) => <PatternBar key={bi} chord={b.chord} steps={b.steps} sub={pattern.sub} now={now && now.bar === bi ? now.slot : null} marks={marksFor(bi)} />)}
      </div>
      {count !== null && <div className="count-in" aria-live="polite">{count}</div>}
      <div className="row-setting">
        <span>템포</span>
        <button className="mini" onClick={() => setBpm(bpm - 4)} disabled={playing}>−4</button>
        <b data-testid="finger-bpm">{bpm}</b>
        <button className="mini" onClick={() => setBpm(bpm + 4)} disabled={playing}>+4</button>
        <span className="muted small">목표 {pattern.bpm[1]}</span>
      </div>
      {mode === 'idle' ? (
        <div className="row-setting">
          <button className="secondary grow" onClick={listen}>▶ 들어 보기</button>
          <button className="primary grow" onClick={follow}>🎤 따라 치기</button>
        </div>
      ) : (
        <button className="primary big stop" onClick={stop}>■ 정지</button>
      )}
      <div className="row-setting small">
        <span>따라 치기 길이</span>
        <div className="segmented small grow">{[1, 2, 4].map((n) => <button key={n} className={reps === n ? 'on' : ''} onClick={() => setReps(n)}>{n * bars.length}마디</button>)}</div>
      </div>
      {error && <p className="error">{error}</p>}
      {result && <FingerResult res={result} target={pattern.bpm[1]} bpm={bpm} />}
      {!result && <p className="hint">따라 치기: 한 마디 셈 뒤 클릭에 맞춰 치면 박자(빠름·늦음)와 음을 봐요. 두 번 연속 통과하면 템포가 4 올라가요{ladderStreak ? ` (지금 ${ladderStreak}번 통과)` : ''}.</p>}
    </div>
  );
}

function FingerResult({ res, target, bpm }: { res: { r: RunResult; ok: boolean; up: boolean; streak: number }; target: number; bpm: number }) {
  const { r } = res;
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const lean = Math.abs(r.meanMs) < 15 ? '박에 잘 맞아요' : r.meanMs > 0 ? `평균 ${Math.round(r.meanMs)}ms 늦어요` : `평균 ${Math.round(-r.meanMs)}ms 빨라요`;
  return (
    <div className={`result ${res.ok ? 'pass' : ''}`} data-testid="finger-result">
      <b>{res.ok ? (res.up ? `통과! 템포를 ${bpm + 4} 로 올렸어요` : '통과! 한 번 더 통과하면 템포가 올라가요') : '조금 더'}</b>
      <div className="stats">
        <div><b>{pct(r.hitRate)}</b><span>친 음</span></div>
        <div><b>{pct(r.pitchRate)}</b><span>맞는 음</span></div>
        <div><b>±{Math.round(r.sdMs)}ms</b><span>흔들림</span></div>
      </div>
      <span className="small">{lean}. {r.extra.length ? `더 친 소리 ${r.extra.length}번. ` : ''}{bpm >= target ? '목표 템포에 닿았어요.' : ''}</span>
      <span className="small muted">탭 아래 점: 초록 맞음 · 노랑 빠름/늦음 · 보라 다른 음 · 회색 놓침</span>
    </div>
  );
}
