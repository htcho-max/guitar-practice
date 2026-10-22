import { useEffect, useRef, useState } from 'react';
import { Sequencer } from '../audio/sequencer';
import { synth } from '../audio/synth';
import { mic } from '../audio/mic';
import { tonality } from '../audio/onset';
import { matchRun, type Expected, type Heard } from '../finger/score';
import { useMic } from '../state/useMic';
import { useSettings } from '../state/settings';
import { usePracticeTimer } from '../state/practice';
import { useWakeLock } from '../state/wakeLock';
import { tuningById, stringNo } from '../guitar/tunings';
import { HARM_SEMIS } from '../fingerstyle/arrange';
import { midiName } from '../audio/notes';
import { clampBpm } from '../audio/schedule';
import { recordReview } from '../data/review';

/** 기법 연습장: 퍼커시브 · 하모닉스 · 레가토 */
export function TechniquePractice() {
  const [mode, setMode] = useState<'perc' | 'harm' | 'legato'>(() => (localStorage.getItem('guitar-tech') as 'perc' | 'harm' | 'legato') || 'perc');
  const pick = (m: typeof mode) => { setMode(m); try { localStorage.setItem('guitar-tech', m); } catch { /* 무시 */ } };
  return (
    <>
      <div className="segmented small">
        <button className={mode === 'perc' ? 'on' : ''} onClick={() => pick('perc')}>퍼커시브</button>
        <button className={mode === 'harm' ? 'on' : ''} onClick={() => pick('harm')}>하모닉스</button>
        <button className={mode === 'legato' ? 'on' : ''} onClick={() => pick('legato')}>해머온·풀오프</button>
      </div>
      {mode === 'perc' ? <PercDrill /> : mode === 'harm' ? <HarmDrill /> : <LegatoDrill />}
    </>
  );
}

// ── 퍼커시브 ──
/** B 엄지 베이스 · M 멜로디 · x 몸통 · S 엄지 슬랩 · R 손톱 브러시 · T 오른손 탭핑 */
type PercTok = 'B' | 'x' | 'M' | 'S' | 'R' | 'T' | '-';
const PERC: { id: string; name: string; seq: PercTok[]; sub: number; tip: string }[] = [
  { id: 'bx', name: '베이스 · 몸통 (4분)', seq: ['B', 'x', 'B', 'x'], sub: 1, tip: 'B = 엄지로 6번 줄 개방, x = 2·4박에 오른손 손바닥(엄지 아래 두툼한 곳)으로 줄 위 몸통 쪽을 탁. 줄 소리가 같이 죽어야 스네어처럼 들려요.' },
  { id: 'bxm', name: '베이스 · 몸통 · 멜로디 (8분)', seq: ['B', 'M', 'x', 'M', 'B', 'M', 'x', 'M'], sub: 2, tip: 'M = 엇박에 a 또는 m 으로 1번 줄. 몸통 치기 뒤에도 멜로디가 끊기지 않게, 손바닥만 줄에서 빨리 떼요.' },
  { id: 'slap', name: '엄지 슬랩', seq: ['B', 'M', 'S', 'M', 'B', 'M', 'S', 'M'], sub: 2, tip: 'S = 엄지 옆면(첫 마디)으로 5·6번 줄을 프렛 쪽으로 내려쳐 "짝" 소리. 손목을 털듯이 치고 바로 튕겨 나와야 다음 멜로디가 살아요.', },
  { id: 'brush', name: '손톱 브러시 (스트럼 대신)', seq: ['B', '-', 'R', 'M', 'B', 'M', 'R', '-'], sub: 2, tip: 'R = i(검지) 손톱 등으로 1~4번 줄을 빠르게 내려 쓸기. 손가락만 펴듯이, 팔은 움직이지 않아요. 브러시 뒤 멜로디는 a 로.' },
  { id: 'tap', name: '오른손 탭핑 + 슬랩', seq: ['B', 'T', 'S', 'T', 'B', 'T', 'S', 'T'], sub: 2, tip: 'T = 오른손 검지나 중지로 1번 줄 12프렛을 망치처럼 두드리고 살짝 끌어내리며 떼기(풀오프). 왼손은 개방 줄. 엄지 베이스·슬랩과 번갈아.' },
];

function PercDrill() {
  const { settings } = useSettings();
  const [pid, setPid] = useState('bx');
  const [bpm, setBpm] = useState(70);
  const [run, setRun] = useState<'idle' | 'listen' | 'follow'>('idle');
  const [now, setNow] = useState<number | null>(null);
  const [res, setRes] = useState<{ hit: number; sd: number; mean: number; kindOk: number; marks: (string | null)[] } | null>(null);
  const seq = useRef(new Sequencer<number>()).current;
  const { start, stop, error } = useMic({ reading: false });
  const p = PERC.find((x) => x.id === pid)!;
  const bars = 2;
  usePracticeTimer('fingerstyle', run !== 'idle');
  useWakeLock(run !== 'idle', settings.wakeLock);
  useEffect(() => () => { seq.stop(); synth.stopAll(); }, [seq]);
  const evs = (sound: boolean) => Array.from({ length: bars }, (_, b) => p.seq.map((t, i) => ({ t, beat: b * (p.seq.length / p.sub) + i / p.sub, i }))).flat()
    .filter((e) => e.t !== '-')
    .map((e) => ({ beat: e.beat, data: e.i, play: sound ? (_c: AudioContext, w: number) => { if (e.t === 'B') synth.note(40, w, 0.8, 0); else if (e.t === 'M') synth.note(64, w, 0.6, 5); else if (e.t === 'T') synth.note(76, w, 0.6, 5, 0.4); else if (e.t === 'R') synth.strum([null, null, 50, 55, 59, 64], w, 'down', 0.55, 0.008); else if (e.t === 'S') synth.slap(w, 1); else synth.hit(w, 1); } : undefined, t: e.t }));
  const beatsTotal = bars * (p.seq.length / p.sub);
  async function listen() {
    setRes(null); await synth.ready();
    await seq.start(evs(true), { bpm, loopBeats: beatsTotal, meterBeats: 4, countIn: 0, click: false, onEvent: (e) => setNow(e.data!) });
    setRun('listen');
  }
  async function follow() {
    setRes(null);
    if (!(await start())) return;
    const heard: (Heard & { tone: number })[] = [];
    const off = mic.subscribeOnset((o) => heard.push({ time: o.time, chroma: o.chroma, tone: tonality(o.chroma) }));
    const list = evs(false);
    await seq.start(list, {
      bpm, endBeats: beatsTotal, meterBeats: 4, countIn: 4, click: true, clickSound: settings.clickSound, clickVolume: settings.clickVolume,
      onEvent: (e) => setNow(e.data!),
      onEnd: () => setTimeout(() => {
        off(); stop();
        const exp: Expected[] = list.map((e, k) => ({ time: seq.timeOf(e.beat), pcs: [], hit: true, slot: k, lap: 0 }));
        const r = matchRun(exp, heard.filter((h) => h.time > exp[0].time - 0.3), 60 / bpm / p.sub);
        let kindN = 0, kindOk = 0;
        const marks = r.steps.map((s, k) => {
          if (!s.heard) return 'miss';
          const want = list[k].t === 'x' || list[k].t === 'S' ? 'perc' : 'tone';
          const tone = (s.heard as Heard & { tone: number }).tone;
          const got = tone < 0.78 ? 'perc' : 'tone';
          kindN++; if (got === want) kindOk++;
          return got !== want ? 'wrong' : Math.abs(s.devMs ?? 0) > 50 ? 'late' : 'ok';
        });
        const ok = r.hitRate >= 0.9 && r.sdMs <= 35;
        recordReview({ key: `tech:perc:${pid}`, kind: 'finger', label: `퍼커시브 ${p.name}`, nav: { tab: 'finger', mode: 'tech' }, note: `${bpm} BPM · 박 ${Math.round(r.hitRate * 100)}%` }, ok);
        if (ok) setBpm((b) => clampBpm(b + 4));
        setRes({ hit: r.hitRate, sd: r.sdMs, mean: r.meanMs, kindOk: kindN ? kindOk / kindN : 1, marks });
        setRun('idle'); setNow(null);
      }, 400),
    });
    setRun('follow');
  }
  const halt = () => { seq.stop(); synth.stopAll(); stop(); setRun('idle'); setNow(null); };
  return (
    <div className="card">
      <div className="chips">{PERC.map((x) => <button key={x.id} className={x.id === pid ? 'chip on' : 'chip'} onClick={() => { setPid(x.id); setRes(null); }}>{x.name}</button>)}</div>
      <p className="hint">{p.tip}</p>
      <div className="perc-row">
        {p.seq.map((t, i) => (
          <span key={i} className={`perc-cell ${i % p.sub === 0 ? 'beat' : ''} ${now === i ? 'now' : ''} ${res?.marks[i] ?? ''}`}>
            <b>{t === 'B' ? '엄지' : t === 'M' ? '멜로디' : t === 'x' ? '✕' : t === 'S' ? '슬랩' : t === 'R' ? '브러시' : t === 'T' ? '탭 12' : '·'}</b>
          </span>
        ))}
      </div>
      <div className="row-setting"><span>템포</span><button className="mini" onClick={() => setBpm(clampBpm(bpm - 4))} disabled={run !== 'idle'}>−4</button><b>{bpm}</b><button className="mini" onClick={() => setBpm(clampBpm(bpm + 4))} disabled={run !== 'idle'}>+4</button></div>
      {run === 'idle' ? (
        <div className="row-setting"><button className="secondary grow" onClick={listen}>▶ 들어 보기</button><button className="primary grow" onClick={follow} data-testid="perc-follow">🎤 따라 치기 (2마디)</button></div>
      ) : <button className="primary big stop" onClick={halt}>■ 정지</button>}
      {error && <p className="error">{error}</p>}
      {res && (
        <div className="result" data-testid="perc-result">
          <div className="stats">
            <div><b>{Math.round(res.hit * 100)}%</b><span>박에 친 소리</span></div>
            <div><b>±{Math.round(res.sd)}ms</b><span>흔들림</span></div>
            <div><b>{Math.round(res.kindOk * 100)}%</b><span>소리 종류 (참고)</span></div>
          </div>
          <span className="small">{Math.abs(res.mean) < 15 ? '박에 잘 맞아요.' : res.mean > 0 ? `평균 ${Math.round(res.mean)}ms 늦어요.` : `평균 ${Math.round(-res.mean)}ms 빨라요.`} 소리 종류는 음이 뚜렷한지로 몸통 치기와 줄 소리를 나눠 본 참고값이에요. 몸통 치기에 줄 소리가 섞이면 손바닥으로 줄을 더 덮어 보세요.</span>
        </div>
      )}
    </div>
  );
}

// ── 하모닉스 ──
const HARM_FRETS = [12, 7, 5, 0];
function HarmDrill() {
  const { settings } = useSettings();
  const tuning = tuningById(settings.tuningId).midi;
  const [fret, setFret] = useState(12);
  /** fret = 0 → 인공 하모닉스: art 프렛을 누르고 +12 에서 */
  const [art, setArt] = useState(2);
  const isArt = fret === 0;
  const [s, setS] = useState(5);
  const [state, setState] = useState<{ verdict: 'ok' | 'pressed' | 'muted' | 'other' | null; heard?: string; ring?: number }>({ verdict: null });
  const [log, setLog] = useState<Record<string, boolean>>({});
  const { reading, on, start, stop, error } = useMic();
  const st = useRef({ armed: false, since: 0, judged: false, okAt: 0, n: 0, last: 0 });
  usePracticeTimer('fingerstyle', on);
  const target = isArt ? tuning[s] + art + 12 : tuning[s] + HARM_SEMIS[fret];
  const pressed = isArt ? tuning[s] + art : tuning[s] + fret;
  const logKey = (i: number) => (isArt ? `${i}:a${art}` : `${i}:${fret}`);
  const label = isArt ? `[${art}]` : `<${fret}>`;
  useEffect(() => {
    if (!on) return;
    return mic.subscribeOnset((o) => { st.current = { armed: true, since: o.time, judged: false, okAt: 0, n: 0, last: 0 }; setState({ verdict: null }); });
  }, [on]);
  useEffect(() => {
    const c = st.current;
    if (!reading || !c.armed) return;
    if (c.judged) {
      // 울림 시간: 맞은 뒤 소리가 사라질 때까지
      if (c.okAt && !reading.freq && reading.time - c.okAt > 0.1) { setState((x) => ({ ...x, ring: reading.time - c.okAt })); c.armed = false; }
      return;
    }
    if (reading.freq) {
      const m = Math.round(69 + 12 * Math.log2(reading.freq / settings.a4));
      if (m === c.last) c.n++; else { c.last = m; c.n = 1; }
      if (c.n < 3) return;
      c.judged = true;
      const v = m === target ? 'ok' : m === pressed ? 'pressed' : 'other';
      if (v === 'ok') c.okAt = reading.time;
      else c.armed = false;
      setState({ verdict: v, heard: midiName(m) });
      setLog((l) => ({ ...l, [logKey(s)]: v === 'ok' || !!l[logKey(s)] }));
      if (v === 'ok') recordReview({ key: isArt ? 'tech:art' : 'tech:harm', kind: 'finger', label: isArt ? '인공 하모닉스 연습' : '하모닉스 연습', nav: { tab: 'finger', mode: 'tech' }, note: `${stringNo(s)}번 줄 ${label}` }, true);
    } else if (reading.time - c.since > 1.0) {
      c.judged = true; c.armed = false;
      setState({ verdict: 'muted' });
    }
  }, [reading]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = Object.values(log).filter(Boolean).length;
  return (
    <div className="card">
      {isArt ? <p className="hint">인공 하모닉스 [f]: 왼손으로 f 프렛을 <b>누른 채</b>, 오른손 검지 끝을 f+12 프렛 쇠 바로 위 줄에 살짝 대고 엄지(또는 약지)로 튕긴 뒤 검지를 떼요. 누른 음보다 한 옥타브 높은 종소리가 나야 해요.</p> : <p className="hint">{fret === 12 ? '12프렛은 눌러도 같은 음이라 맑게 울리는지만 봐요 — 7·5프렛에서 누름/하모닉스를 정확히 구별해요. ' : ''}줄 위, 프렛 쇠 <b>바로 위</b>에 왼손가락을 살짝 대기만 하고(누르지 않기) 튕긴 뒤 곧바로 떼요. 12 → 7 → 5프렛 순으로 어려워져요.</p>}
      <div className="row-setting small"><span>프렛</span><div className="segmented small grow">{HARM_FRETS.map((f) => <button key={f} className={fret === f ? 'on' : ''} onClick={() => { setFret(f); setState({ verdict: null }); }}>{f ? `${f}프렛` : '인공'}</button>)}</div></div>
      {isArt && <div className="row-setting small"><span>누를 프렛</span><button className="mini" onClick={() => { setArt(Math.max(0, art - 1)); setState({ verdict: null }); }}>−</button><b>{art}</b><button className="mini" onClick={() => { setArt(Math.min(7, art + 1)); setState({ verdict: null }); }}>+</button><span className="muted">오른손은 {art + 12}프렛 위</span></div>}
      <div className="strings6">
        {[5, 4, 3, 2, 1, 0].map((i) => (
          <button key={i} className={`string-btn ${s === i ? 'hl' : ''} ${log[logKey(i)] ? 'done' : ''}`} onClick={() => { setS(i); setState({ verdict: null }); }}>
            <small>{stringNo(i)}번</small><b>{midiName(isArt ? tuning[i] + art + 12 : tuning[i] + HARM_SEMIS[fret]).replace(/\d/, '')}</b><small>{log[logKey(i)] ? '✓' : isArt ? `[${art}]` : `<${fret}>`}</small>
          </button>
        ))}
      </div>
      <div className={`verdict ${state.verdict === 'ok' ? 'ok' : state.verdict ? 'wrong' : ''}`} data-testid="harm-verdict">
        <b>{!on ? `${stringNo(s)}번 줄 ${label} — 소리 ${midiName(target)}` : state.verdict === null ? `${stringNo(s)}번 줄 ${label} 하모닉스를 튕기세요` : state.verdict === 'ok' ? '✓ 하모닉스가 울렸어요' : state.verdict === 'pressed' ? (isArt ? '그냥 누른 음이 났어요 — 오른손 검지를 줄에 대고 있다가 튕긴 직후 떼기' : '눌러 버렸어요 — 줄에 닿기만, 누르지 않기') : state.verdict === 'muted' ? '소리가 죽었어요 — 손가락을 더 빨리 떼거나 프렛 쇠 바로 위로' : `다른 음(${state.heard}) — 자리가 어긋났어요`}</b>
        {state.ring !== undefined && <span className="small">울림 {state.ring.toFixed(1)}초 {state.ring >= 1.5 ? '— 좋아요' : '— 손가락을 더 빨리 떼면 길게 울려요'}</span>}
        <span className="small muted">이 프렛 {done}/6줄 성공</span>
      </div>
      <div className="row-setting">
        <button className="secondary" onClick={async () => { const c = await synth.ready(); synth.harm(target, c.currentTime + 0.02, 0.9, s); }}>▶ 소리 듣기</button>
        <button className={`primary grow ${on ? 'stop' : ''}`} onClick={() => (on ? stop() : start())} data-testid="harm-mic">{on ? '마이크 끄기' : '🎤 마이크 켜고 해 보기'}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

// ── 해머온 · 풀오프 ──
const LEGATO: { id: string; name: string; string: number; from: number; to: number; tip: string }[] = [
  { id: 'h57', name: '3번 줄 5 → 7 해머온', string: 3, from: 5, to: 7, tip: '검지로 5프렛을 누르고 튕긴 뒤, 약지를 7프렛에 망치처럼 세게 내려놓아요. 오른손은 한 번만.' },
  { id: 'p75', name: '3번 줄 7 → 5 풀오프', string: 3, from: 7, to: 5, tip: '5·7프렛을 함께 누르고 7프렛만 튕긴 뒤, 약지를 줄 아래쪽으로 살짝 뜯듯이 빼요.' },
  { id: 'h02', name: '2번 줄 0 → 2 해머온', string: 4, from: 0, to: 2, tip: '개방 줄을 튕기고 중지를 2프렛에. 손가락 끝을 세워야 옆 줄이 안 죽어요.' },
  { id: 'p30', name: '1번 줄 3 → 0 풀오프', string: 5, from: 3, to: 0, tip: '3프렛을 누른 채 튕기고, 손가락을 떼며 줄을 살짝 걸어 개방음을 울려요.' },
  { id: 'h79', name: '1번 줄 7 → 9 해머온 (하이 포지션)', string: 5, from: 7, to: 9, tip: '하이 포지션에서는 줄이 팽팽해 더 세게. 7프렛 손가락은 누른 채 그대로.' },
];
function LegatoDrill() {
  const { settings } = useSettings();
  const tuning = tuningById(settings.tuningId).midi;
  const [lid, setLid] = useState('h57');
  const [res, setRes] = useState<{ ok: boolean; msg: string; db?: number }[]>([]);
  const { reading, on, start, stop, error } = useMic();
  const st = useRef({ phase: 0, t1: 0, lv1: -99, onsetAfter: false, n: 0, last: 0 });
  usePracticeTimer('fingerstyle', on);
  const L = LEGATO.find((x) => x.id === lid)!;
  const m1 = tuning[L.string] + L.from, m2 = tuning[L.string] + L.to;
  useEffect(() => {
    if (!on) return;
    return mic.subscribeOnset((o) => { const c = st.current; if (c.phase === 1 && o.time - c.t1 > 0.08) c.onsetAfter = true; else if (c.phase === 0) { c.phase = 0; } });
  }, [on]);
  useEffect(() => {
    const c = st.current;
    if (!reading?.freq) { if (c.phase === 1 && reading && reading.time - c.t1 > 1.2) c.phase = 0; return; }
    const m = Math.round(69 + 12 * Math.log2(reading.freq / settings.a4));
    if (m === c.last) c.n++; else { c.last = m; c.n = 1; }
    if (c.n < 2) return;
    if (c.phase === 0 && m === m1) { c.phase = 1; c.t1 = reading.time; c.lv1 = reading.db; c.onsetAfter = false; return; }
    if (c.phase === 1 && m === m2) {
      const gap = reading.time - c.t1;
      const db = reading.db - c.lv1;
      c.phase = 0;
      let r: { ok: boolean; msg: string; db?: number };
      if (gap > 1.0) r = { ok: false, msg: '두 음 사이가 너무 길어요', db };
      else if (db > 3) r = { ok: false, msg: '둘째 음을 다시 뜯은 것 같아요 (오른손은 한 번만)', db };
      else if (db < -14) r = { ok: false, msg: `둘째 음이 약해요 — ${L.to > L.from ? '더 세게 내려놓기' : '줄을 걸어 뜯듯이 빼기'}`, db };
      else r = { ok: true, msg: '✓ 레가토로 이어졌어요', db };
      setRes((x) => [r, ...x].slice(0, 8));
      recordReview({ key: `tech:legato:${lid}`, kind: 'finger', label: `레가토 ${L.name}`, nav: { tab: 'finger', mode: 'tech' }, note: r.msg }, r.ok);
    }
  }, [reading]); // eslint-disable-line react-hooks/exhaustive-deps
  const okN = res.filter((r) => r.ok).length;
  return (
    <div className="card">
      <div className="chips">{LEGATO.map((x) => <button key={x.id} className={x.id === lid ? 'chip on' : 'chip'} onClick={() => { setLid(x.id); setRes([]); }}>{x.name}</button>)}</div>
      <p className="hint">{L.tip}</p>
      <div className="quiz-q">{stringNo(L.string)}번 줄 {L.from}{L.to > L.from ? 'h' : 'p'}{L.to} <small className="muted">({midiName(m1)} → {midiName(m2)})</small></div>
      <div className="row-setting">
        <button className="secondary" onClick={async () => { const c = await synth.ready(); synth.note(m1, c.currentTime + 0.02, 0.8, L.string); synth.note(m2, c.currentTime + 0.32, 0.55, L.string, 0.3); }}>▶ 들어 보기</button>
        <button className={`primary grow ${on ? 'stop' : ''}`} onClick={() => (on ? stop() : start())}>{on ? '마이크 끄기' : '🎤 마이크 켜고 해 보기'}</button>
      </div>
      {error && <p className="error">{error}</p>}
      {res.length > 0 && (
        <div className="result" data-testid="legato-result">
          <b>{okN}/{res.length} 이어짐</b>
          <ul className="plain small">{res.map((r, i) => <li key={i} className={r.ok ? '' : 'muted'}>{r.msg}{r.db !== undefined ? ` (둘째 음 ${r.db > 0 ? '+' : ''}${r.db.toFixed(0)}dB)` : ''}</li>)}</ul>
        </div>
      )}
      <p className="hint">둘째 음 크기가 첫 음보다 너무 작으면 해머(풀오프)가 약한 것, 오히려 커지면 오른손으로 다시 뜯은 거예요.</p>
    </div>
  );
}
