import { useEffect, useMemo, useRef, useState } from 'react';
import { TUNES, tuneById } from '../fingerstyle/tunes';
import { parseMelody } from '../fingerstyle/melody';
import { arrange, chordSpans, FS_STYLES, type Arrangement, type FsStyle } from '../fingerstyle/arrange';
import { toSongText } from '../fingerstyle/ascii';
import { FsBars, type FsMark } from '../components/FsBars';
import { matchRun, type Expected, type Heard, type RunResult } from '../finger/score';
import { containsNote } from '../audio/onset';
import { Sequencer } from '../audio/sequencer';
import { synth } from '../audio/synth';
import { mic } from '../audio/mic';
import { useMic } from '../state/useMic';
import { useSettings } from '../state/settings';
import { usePracticeTimer } from '../state/practice';
import { useWakeLock } from '../state/wakeLock';
import { setBusy } from '../state/busy';
import { navigate } from '../state/navigate';
import { db, kvGet, kvSet } from '../data/db';
import { addSong } from '../data/songs';
import { localDate } from '../data/dates';
import { recordReview } from '../data/review';
import { clampBpm } from '../audio/schedule';

const seq = new Sequencer<number>();

export interface FsResult { r: RunResult; melRate: number; ok: boolean }

/** 편곡 하나를 보고·듣고(목소리별로)·따라 치기 */
export function FsPlayer({ arr, bpm, setBpm, target, onResult }: { arr: Arrangement; bpm: number; setBpm: (b: number) => void; target?: number; onResult?: (r: FsResult) => { up: boolean } | void }) {
  const { settings } = useSettings();
  const [mode, setMode] = useState<'idle' | 'listen' | 'follow'>('idle');
  const [now, setNow] = useState<number | null>(null);
  const [count, setCount] = useState<number | null>(null);
  const [hide, setHide] = useState<Set<string>>(new Set());
  const [loop, setLoop] = useState(false);
  const [res, setRes] = useState<(FsResult & { up: boolean; marks: Map<number, FsMark> }) | null>(null);
  const { start: micStart, stop: micStop, error } = useMic({ reading: false });
  const heard = useRef<Heard[]>([]);
  const playing = mode !== 'idle';
  usePracticeTimer('fingerstyle', playing);
  useWakeLock(playing, settings.wakeLock);
  useEffect(() => { setBusy('fs', playing); return () => setBusy('fs', false); }, [playing]);
  useEffect(() => () => { seq.stop(); synth.stopAll(); }, []);
  const key = arr.events.length + ':' + arr.beats + ':' + bpm + ':' + arr.events.map((e) => e.notes.length).join('');
  useEffect(() => { stop(); setRes(null); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggleVoice = (v: string) => setHide((h) => { const n = new Set(h); if (n.has(v)) n.delete(v); else n.add(v); return n; });

  async function listen() {
    setRes(null);
    await synth.ready();
    const evs = arr.events.map((e, i) => ({
      beat: e.beat, data: i,
      play: (_c: AudioContext, w: number) => e.notes.forEach((n) => { if (!hide.has(n.voice)) synth.note(n.midi, w, n.voice === 'mel' ? 0.95 : n.voice === 'bass' ? 0.6 : 0.45, n.string, n.voice === 'mel' ? 0.7 : 0.45); }),
    }));
    await seq.start(evs, {
      bpm, ...(loop ? { loopBeats: arr.beats } : { endBeats: arr.beats }), meterBeats: arr.beatsPerBar, countIn: 0, click: false,
      onEvent: (e) => setNow(arr.events[e.data!].beat), onEnd: () => { setMode('idle'); setNow(null); },
    });
    setMode('listen');
  }
  async function follow() {
    setRes(null);
    if (!(await micStart())) return;
    heard.current = [];
    const off = mic.subscribeOnset((o) => heard.current.push({ time: o.time, chroma: o.chroma }));
    await seq.start(arr.events.map((e, i) => ({ beat: e.beat, data: i })), {
      bpm, endBeats: arr.beats, meterBeats: arr.beatsPerBar, countIn: arr.beatsPerBar, click: true,
      clickSound: settings.clickSound, clickVolume: settings.clickVolume,
      onEvent: (e) => setNow(arr.events[e.data!].beat),
      onBeat: (b) => setCount(b < 0 ? -b : null),
      onEnd: () => setTimeout(() => {
        off(); micStop();
        const exp: Expected[] = arr.events.map((e, i) => ({ time: seq.timeOf(e.beat), pcs: [...new Set(e.notes.map((n) => n.midi % 12))], hit: false, slot: i, lap: 0 }));
        const first = exp[0]?.time ?? 0;
        const r = matchRun(exp, heard.current.filter((h) => h.time > first - 0.3), Math.max(0.12, 60 / bpm / 2));
        // 멜로디 음이 들렸는지 (멜로디 있는 사건만)
        let melN = 0, melOk = 0;
        const marks = new Map<number, FsMark>();
        r.steps.forEach((s, i) => {
          const e = arr.events[i];
          const mel = e.notes.find((n) => n.voice === 'mel');
          let mk: FsMark = !s.heard ? 'miss' : s.pitchOk === false ? 'wrong' : (s.devMs ?? 0) > 50 ? 'late' : (s.devMs ?? 0) < -50 ? 'early' : 'ok';
          if (mel) {
            melN++;
            const ok = !!s.heard && containsNote(s.heard.chroma, mel.midi % 12);
            if (ok) melOk++; else if (s.heard) mk = 'wrong';
          }
          marks.set(e.beat, mk);
        });
        const melRate = melN ? melOk / melN : 1;
        const ok = r.hitRate >= 0.85 && melRate >= 0.8 && r.sdMs <= 40;
        const o = onResult?.({ r, melRate, ok }) || { up: false };
        setRes({ r, melRate, ok, up: o.up, marks });
        setMode('idle'); setNow(null); setCount(null);
      }, 400),
    });
    setMode('follow');
  }
  function stop() { seq.stop(); synth.stopAll(); micStop(); setMode('idle'); setNow(null); setCount(null); }

  return (
    <div className="card">
      <div className="voice-legend">
        <span>들을 소리:</span>
        {([['mel', '멜로디'], ['bass', '베이스'], ['fill', '채우기']] as const).map(([v, t]) => (
          <label key={v} className={v}><input type="checkbox" checked={!hide.has(v)} onChange={() => toggleVoice(v)} disabled={playing} /> {t}</label>
        ))}
      </div>
      <FsBars arr={arr} now={now} marks={res?.marks} hide={hide} />
      {count !== null && <div className="count-in">{count}</div>}
      <div className="row-setting">
        <span>템포</span>
        <button className="mini" onClick={() => setBpm(bpm - 4)} disabled={playing}>−4</button>
        <b data-testid="fs-bpm">{bpm}</b>
        <button className="mini" onClick={() => setBpm(bpm + 4)} disabled={playing}>+4</button>
        {target && <span className="muted small">목표 {target}</span>}
        <label className="small"><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} disabled={playing} /> 반복 듣기</label>
      </div>
      {mode === 'idle' ? (
        <div className="row-setting">
          <button className="secondary grow" onClick={listen}>▶ 들어 보기</button>
          <button className="primary grow" onClick={follow} data-testid="fs-follow">🎤 따라 치기</button>
        </div>
      ) : <button className="primary big stop" onClick={stop}>■ 정지</button>}
      {error && <p className="error">{error}</p>}
      {res ? (
        <div className={`result ${res.ok ? 'pass' : ''}`} data-testid="fs-result">
          <b>{res.ok ? (res.up ? `통과! 템포를 ${bpm + 4} 로 올렸어요` : '통과!') : '조금 더'}</b>
          <div className="stats">
            <div><b>{Math.round(res.r.hitRate * 100)}%</b><span>박에 친 소리</span></div>
            <div><b>{Math.round(res.melRate * 100)}%</b><span>멜로디 음</span></div>
            <div><b>±{Math.round(res.r.sdMs)}ms</b><span>흔들림</span></div>
          </div>
          <span className="small">{res.melRate < 0.8 ? '멜로디가 묻히거나 다른 음이 났어요. 멜로디(주황 숫자)를 조금 더 세게, 베이스는 가볍게. ' : ''}{Math.abs(res.r.meanMs) < 15 ? '박에 잘 맞아요.' : res.r.meanMs > 0 ? `평균 ${Math.round(res.r.meanMs)}ms 늦어요.` : `평균 ${Math.round(-res.r.meanMs)}ms 빨라요.`}</span>
        </div>
      ) : <p className="hint">주황 숫자가 멜로디(a·m·i), 검은 숫자가 엄지 베이스, 회색이 채우는 음이에요. "들을 소리"로 멜로디만, 베이스만 들어 보고 합쳐 보세요.</p>}
    </div>
  );
}

/** 단계별 연습곡 */
export function FingerstylePractice() {
  const { settings } = useSettings();
  const level = settings.level ?? 1;
  const [tid, setTid] = useState(() => localStorage.getItem('guitar-fs-tune') ?? 'twinkle');
  const [style, setStyle] = useState<FsStyle>(() => (Number(localStorage.getItem('guitar-fs-style')) as FsStyle) || (level >= 3 ? 2 : 1));
  const [ladder, setLadder] = useState<Record<string, { bpm: number; streak: number }>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const tune = tuneById(tid);
  const key = `${tid}:${style}`;
  const startBpm = Math.max(50, Math.round(tune.tempo * 0.7 / 4) * 4);
  const bpm = ladder[key]?.bpm ?? startBpm;
  useEffect(() => { kvGet('fs-ladder', {}).then(setLadder); }, []);
  useEffect(() => { try { localStorage.setItem('guitar-fs-tune', tid); localStorage.setItem('guitar-fs-style', String(style)); } catch { /* 무시 */ } setMsg(null); }, [tid, style]);
  const arr = useMemo(() => arrange(parseMelody(tune.melody).notes, chordSpans(tune.chords, tune.beats), tune.beats, style), [tune, style]);
  const setBpm = (b: number) => { const n = { ...ladder, [key]: { bpm: clampBpm(b), streak: 0 } }; setLadder(n); kvSet('fs-ladder', n); };
  const st = FS_STYLES.find((s) => s.id === style)!;
  return (
    <>
      <div className="card">
        <div className="card-head"><b>연습곡</b><span className="muted small">저작권이 끝난 곡</span></div>
        <div className="chips">{TUNES.map((t) => <button key={t.id} className={t.id === tid ? 'chip on' : 'chip'} onClick={() => setTid(t.id)}>{t.title}<small className="muted"> {t.beats}/4</small></button>)}</div>
        <div className="card-head"><b>단계</b></div>
        <div className="chips">{FS_STYLES.map((s) => <button key={s.id} className={s.id === style ? 'chip on' : 'chip'} onClick={() => setStyle(s.id)}>{s.name}</button>)}</div>
        <p className="hint">{st.tip}</p>
        <div className="row-setting small">
          <span className="muted">{tune.title} · {tune.credit}{arr.shift ? ` · 멜로디 ${arr.shift > 0 ? '한 옥타브 올림' : '한 옥타브 내림'}` : ''}</span>
          <button className="link small" onClick={async () => {
            const r = await addSong(toSongText(arr, { title: `${tune.title} (핑거스타일 ${style}단계)`, artist: tune.credit, tempo: tune.tempo, note: st.name }));
            setMsg('내 곡에 저장했어요.');
            setTimeout(() => navigate({ tab: 'song', songId: r.id }), 600);
          }}>내 곡에 탭으로 저장</button>
        </div>
        {msg && <p className="hint">{msg}</p>}
      </div>
      <FsPlayer arr={arr} bpm={bpm} setBpm={setBpm} target={tune.tempo} onResult={(r) => {
        const prev = ladder[key] ?? { bpm, streak: 0 };
        let next = { bpm: prev.bpm, streak: r.ok ? prev.streak + 1 : 0 };
        if (next.streak >= 2) next = { bpm: clampBpm(prev.bpm + 4), streak: 0 };
        const n = { ...ladder, [key]: next };
        setLadder(n); kvSet('fs-ladder', n);
        db.fingerRuns.add({ patternId: `fs:${key}`, chords: tune.title, bpm, hitRate: r.r.hitRate, pitchRate: r.melRate, meanMs: r.r.meanMs, sdMs: r.r.sdMs, passed: r.ok, date: localDate(), at: Date.now() }).catch(() => {});
        recordReview({ key: `fs:${key}`, kind: 'finger', label: `핑거스타일 ${tune.title} ${style}단계`, nav: { tab: 'finger', mode: 'fs', tuneId: tid, style }, note: `${bpm} BPM · 멜로디 ${Math.round(r.melRate * 100)}%` }, r.ok);
        return { up: next.bpm > prev.bpm };
      }} />
    </>
  );
}
