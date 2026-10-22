import { useEffect, useRef, useState } from 'react';
import { Fretboard, type FbDot } from '../components/Fretboard';
import { useSettings } from '../state/settings';
import { useMic } from '../state/useMic';
import { usePracticeTimer } from '../state/practice';
import { tuningById, stringNo } from '../guitar/tunings';
import { NOTE_NAMES, NOTE_NAMES_KO, midiName } from '../audio/notes';
import { synth } from '../audio/synth';
import { kvGet, kvSet } from '../data/db';
import { recordReview } from '../data/review';
import { pickPosition, updateStat, fretsOf, NATURAL_PCS, type FretStats } from '../fret/quiz';

const ROUND = 20;

/** 지판 음 이름 외우기: 보이는 자리의 이름 고르기 / 이름을 보고 마이크로 찾아 치기 */
export function FretTrainer() {
  const { settings } = useSettings();
  const tuning = tuningById(settings.tuningId).midi;
  const [mode, setMode] = useState<'name' | 'find'>('name');
  const [maxFret, setMaxFret] = useState(() => Number(localStorage.getItem('guitar-fret-max') ?? (settings.level === 1 ? 5 : 12)));
  const [naturals, setNaturals] = useState(() => localStorage.getItem('guitar-fret-nat') !== '0');
  const [strings, setStrings] = useState<number[]>(() => JSON.parse(localStorage.getItem('guitar-fret-strings') ?? '[0,1,2,3,4,5]'));
  const [stats, setStats] = useState<FretStats>({});
  const [q, setQ] = useState<{ s: number; f: number; at: number } | null>(null);
  const [answer, setAnswer] = useState<{ pc: number; ok: boolean; heardFret?: number } | null>(null);
  const [score, setScore] = useState({ n: 0, ok: 0, ms: 0 });
  const [showHeat, setShowHeat] = useState(false);
  const [done, setDone] = useState(false);
  const { reading, on, error, start, stop } = useMic();
  const stable = useRef({ last: 0, n: 0 });
  usePracticeTimer('fretboard', q !== null && !done);
  useEffect(() => { kvGet<FretStats>('fret-stats', {}).then(setStats); }, []);
  useEffect(() => { try { localStorage.setItem('guitar-fret-max', String(maxFret)); localStorage.setItem('guitar-fret-nat', naturals ? '1' : '0'); localStorage.setItem('guitar-fret-strings', JSON.stringify(strings)); } catch { /* 무시 */ } }, [maxFret, naturals, strings]);
  const opts = { strings, maxFret, naturalsOnly: naturals, tuning };

  const next = (avoid?: string) => { const p = pickPosition(opts, stats, Math.random, avoid); setQ({ ...p, at: performance.now() }); setAnswer(null); stable.current = { last: 0, n: 0 }; };
  const begin = async () => {
    setScore({ n: 0, ok: 0, ms: 0 }); setDone(false);
    if (mode === 'find' && !(await start())) return;
    next();
  };
  const finish = (sc: typeof score) => {
    setDone(true); setQ(null); stop();
    recordReview({ key: `fret:${mode}`, kind: 'fret', label: mode === 'name' ? '지판 음 이름 (보고 맞히기)' : '지판 음 찾아 치기', nav: { tab: 'tuner', view: 'fretboard' }, note: `${sc.ok}/${sc.n}` }, sc.ok / Math.max(1, sc.n) >= 0.85);
  };
  const judge = (ok: boolean, pc: number, heardFret?: number) => {
    if (!q || answer) return;
    const ms = performance.now() - q.at;
    const key = `${q.s}:${q.f}`;
    const ns = updateStat(stats, key, ok, ms);
    setStats(ns); kvSet('fret-stats', ns);
    setAnswer({ pc, ok, heardFret });
    const sc = { n: score.n + 1, ok: score.ok + (ok ? 1 : 0), ms: score.ms + (ok ? ms : 0) };
    setScore(sc);
    if (ok) synth.ready().then(() => synth.note(tuning[q.s] + q.f, 0, 0.6, q.s));
    setTimeout(() => { if (sc.n >= ROUND) finish(sc); else next(key); }, ok ? 650 : 1400);
  };

  // 찾아 치기: 같은 음 4프레임 → 판정
  useEffect(() => {
    if (mode !== 'find' || !q || answer || !reading?.freq) return;
    const m = Math.round(69 + 12 * Math.log2(reading.freq / settings.a4));
    const st = stable.current;
    if (m === st.last) st.n++; else { st.last = m; st.n = 1; }
    if (st.n < 4) return;
    const target = tuning[q.s] + q.f;
    const want = (target % 12);
    const okFrets = fretsOf(want, q.s, tuning, Math.max(maxFret, 12)).map((f) => tuning[q.s] + f);
    const ok = okFrets.includes(m);
    judge(ok, ((m % 12) + 12) % 12, ok ? m - tuning[q.s] : undefined);
  }, [reading]); // eslint-disable-line react-hooks/exhaustive-deps

  const pc = q ? (tuning[q.s] + q.f) % 12 : -1;
  const dots: FbDot[] = [];
  if (q && mode === 'name') dots.push({ string: q.s, fret: q.f, label: answer ? NOTE_NAMES[pc] : '?', cls: answer ? (answer.ok ? 'ok' : 'bad') : 'q' });
  if (q && mode === 'find' && answer) {
    fretsOf(pc, q.s, tuning, maxFret).forEach((f) => dots.push({ string: q.s, fret: f, label: NOTE_NAMES[pc], cls: answer.ok ? 'ok' : 'q' }));
  }
  const heat: Record<string, number> = {};
  if (showHeat) Object.entries(stats).forEach(([k, v]) => { if (v.n) heat[k] = v.ok / v.n; });
  const choices = naturals ? NATURAL_PCS : Array.from({ length: 12 }, (_, i) => i);
  const weak = Object.entries(stats).filter(([, v]) => v.n >= 2 && v.ok / v.n < 0.7).length;

  return (
    <>
      <div className="segmented small">
        <button className={mode === 'name' ? 'on' : ''} onClick={() => { setMode('name'); setQ(null); stop(); }}>보고 이름 맞히기</button>
        <button className={mode === 'find' ? 'on' : ''} onClick={() => { setMode('find'); setQ(null); }}>이름 보고 찾아 치기 🎤</button>
      </div>
      <div className="card">
        {q ? (
          <>
            <div className="quiz-score"><span>{score.n + (answer ? 0 : 1)} / {ROUND}</span><span>맞음 {score.ok}</span></div>
            <div className="quiz-q" data-testid="fret-q">
              {mode === 'name' ? `${stringNo(q.s)}번 줄 ${q.f}프렛은?` : <>{stringNo(q.s)}번 줄에서 <span className="accent">{NOTE_NAMES[pc]}</span> ({NOTE_NAMES_KO[NOTE_NAMES[pc]]})</>}
            </div>
            {mode === 'find' && answer && !answer.ok && <p className="hint center">들린 음: {NOTE_NAMES[answer.pc]} — 정답 자리를 보세요</p>}
            {mode === 'find' && !answer && <p className="hint center">{on ? '그 줄에서 찾아 한 번 튕기세요' : '마이크를 켜는 중…'}{reading?.freq ? ` · 지금 ${midiName(Math.round(69 + 12 * Math.log2(reading.freq / settings.a4)))}` : ''}</p>}
          </>
        ) : done ? (
          <div className="result pass" data-testid="fret-result">
            <b>{score.ok} / {score.n} 맞음{score.ok ? ` · 평균 ${(score.ms / score.ok / 1000).toFixed(1)}초` : ''}</b>
            <span className="small">{score.ok / Math.max(1, score.n) >= 0.85 ? '좋아요! 범위를 넓혀 보세요.' : '틀린 자리가 자주 나와요. 한 번 더!'}</span>
          </div>
        ) : <p className="hint">{mode === 'name' ? '표시된 자리의 음 이름을 고르세요. 틀린 자리는 더 자주 나와요.' : '음 이름을 보고 그 줄에서 찾아 튕기면 마이크로 확인해요.'} 한 판 {ROUND}문제.</p>}
        <Fretboard maxFret={maxFret} dots={dots} tuning={tuning} hlString={q?.s ?? null} heat={showHeat ? heat : undefined} />
        {q && mode === 'name' && (
          <div className="note-grid12">
            {choices.map((c) => (
              <button key={c} className={answer ? (c === pc ? 'right' : answer.pc === c ? 'wrong' : '') : ''} onClick={() => judge(c === pc, c)} disabled={!!answer}>{NOTE_NAMES[c]}</button>
            ))}
          </div>
        )}
        {q ? <button className="secondary" onClick={() => { setQ(null); stop(); }}>그만</button>
          : <button className="primary big" onClick={begin} data-testid="fret-start">▶ 시작</button>}
        {error && <p className="error">{error}</p>}
      </div>
      <div className="card">
        <div className="row-setting">
          <span>프렛</span>
          <div className="segmented small grow">{[5, 7, 12].map((n) => <button key={n} className={maxFret === n ? 'on' : ''} onClick={() => setMaxFret(n)}>0~{n}</button>)}</div>
        </div>
        <div className="row-setting small">
          <span>줄</span>
          {[5, 4, 3, 2, 1, 0].map((s) => (
            <button key={s} className={`mini ${strings.includes(s) ? 'on-chip' : ''}`} onClick={() => setStrings((cur) => (cur.includes(s) ? (cur.length > 1 ? cur.filter((x) => x !== s) : cur) : [...cur, s].sort()))}>{stringNo(s)}</button>
          ))}
        </div>
        <label className="row-setting small"><input type="checkbox" checked={naturals} onChange={(e) => setNaturals(e.target.checked)} /> 자연음만 (♯·♭ 빼기)</label>
        <label className="row-setting small"><input type="checkbox" checked={showHeat} onChange={(e) => setShowHeat(e.target.checked)} /> 자리별 정답률 보기 (초록 잘함 · 빨강 자주 틀림){weak ? ` · ${weak}자리` : ''}</label>
      </div>
    </>
  );
}
