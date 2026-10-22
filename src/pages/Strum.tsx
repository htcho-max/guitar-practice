import { useEffect, useMemo, useRef, useState } from 'react';
import { STRUMS, strumById, strokes, type StrumPattern } from '../strum/patterns';
import { strumBalance, type StrumHeard } from '../strum/analysis';
import { PROGRESSIONS } from '../finger/patterns';
import { matchRun, passed, type Expected, type Heard, type RunResult } from '../finger/score';
import { parseChord, shapeForSymbol } from '../guitar/symbols';
import { shapeMidis } from '../guitar/chords';
import { tuningById } from '../guitar/tunings';
import { StrumBar } from '../components/StrumBar';
import type { SlotMark } from '../components/TabBar6';
import { Sequencer, type SeqEvent } from '../audio/sequencer';
import { synth } from '../audio/synth';
import { mic } from '../audio/mic';
import { useMic } from '../state/useMic';
import { useSettings } from '../state/settings';
import { usePracticeTimer } from '../state/practice';
import { useWakeLock } from '../state/wakeLock';
import { setBusy } from '../state/busy';
import { db, kvGet, kvSet } from '../data/db';
import { localDate } from '../data/dates';
import { clampBpm } from '../audio/schedule';
import { recordReview } from '../data/review';

type Pos = { bar: number; slot: number };
const seq = new Sequencer<Pos>();

export function StrumPractice({ initial }: { initial?: string }) {
  const { settings } = useSettings();
  const level = settings.level ?? 1;
  const tuning = tuningById(settings.tuningId).midi;
  const [pid, setPid] = useState(initial ?? localStorage.getItem('guitar-strum-pattern') ?? (level === 1 ? 'quarter' : 'folk'));
  const [chords, setChords] = useState<string[]>(JSON.parse(localStorage.getItem('guitar-strum-chords') ?? '["G","C"]'));
  const [ladder, setLadder] = useState<Record<string, { bpm: number; streak: number }>>({});
  const pattern = strumById(pid);
  const bpm = ladder[pid]?.bpm ?? pattern.bpm[0];
  useEffect(() => { kvGet('strum-ladder', {}).then(setLadder); }, []);
  useEffect(() => { try { localStorage.setItem('guitar-strum-pattern', pid); localStorage.setItem('guitar-strum-chords', JSON.stringify(chords)); } catch { /* 무시 */ } }, [pid, chords]);
  const setBpm = (b: number) => { const n = { ...ladder, [pid]: { bpm: clampBpm(b), streak: 0 } }; setLadder(n); kvSet('strum-ladder', n); };
  const shapes = chords.map((n) => { const c = parseChord(n); return c ? shapeForSymbol(c) : null; });

  return (
    <>
      <div className="card">
        <div className="card-head"><b>긁기 패턴</b><span className="muted small">↓ 다운 · ↑ 업 · ✕ 뮤트 · 쉼에도 손은 흔들기</span></div>
        <div className="chips">
          {STRUMS.filter((p) => p.level <= level).map((p) => <button key={p.id} className={p.id === pid ? 'chip on' : 'chip'} onClick={() => setPid(p.id)}>{p.name}</button>)}
        </div>
        <p className="hint">{pattern.tip}</p>
        <div className="chips scroll-x">
          {PROGRESSIONS.filter((p) => p.level <= level && p.chords.length > 1).map((p) => {
            const k = p.chords.join(' ');
            return <button key={k} className={k === chords.join(' ') ? 'chip on' : 'chip'} onClick={() => setChords(p.chords)}>{p.chords.join(' – ')}</button>;
          })}
        </div>
      </div>
      <StrumPlayer pattern={pattern} chords={chords} midis={shapes.map((s) => (s ? shapeMidis(s, tuning) : null))} bpm={bpm} setBpm={setBpm}
        onResult={(r) => {
          const prev = ladder[pid] ?? { bpm, streak: 0 };
          const ok = passed({ ...r, pitchRate: 1 });
          let next = { bpm: prev.bpm, streak: ok ? prev.streak + 1 : 0 };
          if (next.streak >= 2) next = { bpm: clampBpm(prev.bpm + 4), streak: 0 };
          const n = { ...ladder, [pid]: next };
          setLadder(n); kvSet('strum-ladder', n);
          db.fingerRuns.add({ patternId: 'strum:' + pid, chords: chords.join(' '), bpm, hitRate: r.hitRate, pitchRate: 1, meanMs: r.meanMs, sdMs: r.sdMs, passed: ok, date: localDate(), at: Date.now() }).catch(() => {});
          recordReview({ key: `strum:${pid}`, kind: 'strum', label: `스트럼 ${pattern.name}`, nav: { tab: 'chord', mode: 'strum', strumId: pid }, note: `${bpm} BPM · 맞춘 ${Math.round(r.hitRate * 100)}%` }, ok);
          return { ok, up: next.bpm > prev.bpm };
        }} />
    </>
  );
}

function StrumPlayer({ pattern, chords, midis, bpm, setBpm, onResult }: {
  pattern: StrumPattern; chords: string[]; midis: ((number | null)[] | null)[]; bpm: number; setBpm: (b: number) => void;
  onResult: (r: RunResult) => { ok: boolean; up: boolean };
}) {
  const { settings } = useSettings();
  const [mode, setMode] = useState<'idle' | 'listen' | 'follow'>('idle');
  const [now, setNow] = useState<Pos | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [result, setResult] = useState<{ r: RunResult; ok: boolean; up: boolean; hint: string | null; extraRest: number } | null>(null);
  const { start: micStart, stop: micStop, error } = useMic({ reading: false });
  const heard = useRef<(Heard & StrumHeard)[]>([]);
  const playing = mode !== 'idle';
  usePracticeTimer('strum', playing);
  useWakeLock(playing, settings.wakeLock);
  useEffect(() => { setBusy('strum', playing); return () => setBusy('strum', false); }, [playing]);
  useEffect(() => () => { seq.stop(); synth.stopAll(); }, []);
  const key = pattern.id + chords.join() + bpm;
  useEffect(() => { stop(); setResult(null); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const st = useMemo(() => strokes(pattern), [pattern]);
  const reps = 2;

  const events = (withSound: boolean, times: number): SeqEvent<Pos>[] => {
    const out: SeqEvent<Pos>[] = [];
    for (let r = 0; r < times; r++) chords.forEach((_, bi) => {
      const m = midis[bi];
      for (let slot = 0; slot < pattern.seq.length; slot++) {
        const c = pattern.seq[slot];
        out.push({
          beat: (r * chords.length + bi) * pattern.beats + slot / pattern.sub, data: { bar: bi, slot },
          play: withSound && m ? (_x, w) => {
            if (c === 'D') synth.strum(m, w, 'down', slot === 0 ? 0.85 : 0.72);
            else if (c === 'U') synth.strum(m, w, 'up', 0.55);
            else if (c === 'x') synth.chuck(w);
          } : undefined,
        });
      }
    });
    return out;
  };

  async function listen() {
    setResult(null);
    await synth.ready();
    await seq.start(events(true, 1), { bpm, loopBeats: chords.length * pattern.beats, meterBeats: pattern.beats, countIn: 0, click: false, onEvent: (e) => setNow(e.data!) });
    setMode('listen');
  }

  async function follow() {
    setResult(null);
    if (!(await micStart())) return;
    heard.current = [];
    const off = mic.subscribeOnset((o) => heard.current.push({ time: o.time, chroma: o.chroma, lowShare: o.lowShare, strength: o.strength }));
    const total = chords.length * reps * pattern.beats;
    await seq.start(events(false, reps), {
      bpm, endBeats: total, meterBeats: pattern.beats, countIn: pattern.beats, click: true,
      clickSound: settings.clickSound, clickVolume: settings.clickVolume,
      onEvent: (e) => setNow(e.data!),
      onBeat: (b) => setCount(b < 0 ? -b : null),
      onEnd: () => setTimeout(() => {
        off(); micStop();
        const exp: Expected[] = [];
        const kinds: ('D' | 'U' | 'x')[] = [];
        for (let r = 0; r < reps; r++) chords.forEach((_, bi) => st.forEach((s) => {
          exp.push({ time: seq.timeOf((r * chords.length + bi) * pattern.beats + s.beat), pcs: [], hit: true, slot: bi * 1000 + s.slot, lap: r });
          kinds.push(s.kind);
        }));
        const first = exp[0]?.time ?? 0;
        const hs = heard.current.filter((h) => h.time > first - 0.3);
        const res = matchRun(exp, hs, 60 / bpm / pattern.sub);
        const map = new Map(hs.map((h) => [h.time, h]));
        const bal = strumBalance(res, kinds, map);
        const o = onResult(res);
        setResult({ r: res, ...o, hint: bal.hint, extraRest: res.extra.length });
        setMode('idle'); setNow(null); setCount(null);
      }, 400),
    });
    setMode('follow');
  }

  function stop() { seq.stop(); synth.stopAll(); micStop(); setMode('idle'); setNow(null); setCount(null); }

  const marksFor = (bi: number): (SlotMark | null)[] | undefined => {
    if (!result) return undefined;
    return [...pattern.seq].map((_, slot) => {
      const rs = result.r.steps.filter((s) => s.exp.slot === bi * 1000 + slot);
      if (!rs.length) return null;
      if (rs.filter((s) => !s.heard).length * 2 >= rs.length) return 'miss';
      const devs = rs.filter((s) => s.devMs !== null).map((s) => s.devMs!);
      const m = devs.reduce((a, b) => a + b, 0) / Math.max(1, devs.length);
      return m > 45 ? 'late' : m < -45 ? 'early' : 'ok';
    });
  };

  return (
    <div className="card">
      <div className="strum-wrap">
        {chords.map((c, bi) => <StrumBar key={bi} chord={c} pattern={pattern} now={now && now.bar === bi ? now.slot : null} marks={marksFor(bi)} />)}
      </div>
      {count !== null && <div className="count-in">{count}</div>}
      <div className="row-setting">
        <span>템포</span>
        <button className="mini" onClick={() => setBpm(bpm - 4)} disabled={playing}>−4</button>
        <b data-testid="strum-bpm">{bpm}</b>
        <button className="mini" onClick={() => setBpm(bpm + 4)} disabled={playing}>+4</button>
        <span className="muted small">목표 {pattern.bpm[1]}</span>
      </div>
      {mode === 'idle' ? (
        <div className="row-setting">
          <button className="secondary grow" onClick={listen}>▶ 들어 보기</button>
          <button className="primary grow" onClick={follow}>🎤 따라 긁기</button>
        </div>
      ) : <button className="primary big stop" onClick={stop}>■ 정지</button>}
      {error && <p className="error">{error}</p>}
      {result ? (
        <div className={`result ${result.ok ? 'pass' : ''}`} data-testid="strum-result">
          <b>{result.ok ? (result.up ? `통과! 템포를 ${bpm + 4} 로 올렸어요` : '통과! 한 번 더 통과하면 템포가 올라가요') : '조금 더'}</b>
          <div className="stats">
            <div><b>{Math.round(result.r.hitRate * 100)}%</b><span>맞춘 긋기</span></div>
            <div><b>{result.extraRest}</b><span>쉼에 친 소리</span></div>
            <div><b>±{Math.round(result.r.sdMs)}ms</b><span>흔들림</span></div>
          </div>
          <span className="small">{Math.abs(result.r.meanMs) < 15 ? '박에 잘 맞아요.' : result.r.meanMs > 0 ? `평균 ${Math.round(result.r.meanMs)}ms 늦어요.` : `평균 ${Math.round(-result.r.meanMs)}ms 빨라요.`} {result.extraRest ? '쉼(·)에서는 줄에 닿지 않게 허공을 그어요.' : ''}</span>
          {result.hint && <span className="small">{result.hint}</span>}
        </div>
      ) : <p className="hint">따라 긁기: 한 마디 셈 뒤 클릭에 맞춰 {reps * chords.length}마디를 긁으면 박자와 쉼을 봐요. 두 번 연속 통과하면 템포 +4.</p>}
    </div>
  );
}
