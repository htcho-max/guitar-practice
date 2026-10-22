import { useEffect, useMemo, useRef, useState } from 'react';
import { Fretboard, type FbDot } from '../components/Fretboard';
import { SCALES, scaleById, boxNotes, neckNotes, positionCount, type FretNote } from '../guitar/scales';
import { tuningById } from '../guitar/tunings';
import { PC_NAMES, NOTE_NAMES } from '../audio/notes';
import { useSettings } from '../state/settings';
import { useMic } from '../state/useMic';
import { usePracticeTimer } from '../state/practice';
import { useWakeLock } from '../state/wakeLock';
import { Sequencer } from '../audio/sequencer';
import { synth } from '../audio/synth';
import { clampBpm } from '../audio/schedule';
import { kvGet, kvSet } from '../data/db';
import { recordReview } from '../data/review';

const seq = new Sequencer<number>();

/** 스케일 모양: 키·스케일·포지션, 오르내리기 듣기, 마이크로 한 음씩 따라 치기 */
export function ScalePractice() {
  const { settings } = useSettings();
  const tuning = tuningById(settings.tuningId).midi;
  const level = settings.level ?? 1;
  const [sid, setSid] = useState(() => localStorage.getItem('guitar-scale') ?? 'minpent');
  const [root, setRoot] = useState(() => Number(localStorage.getItem('guitar-scale-root') ?? 9));
  const [pos, setPos] = useState<number | 'all'>(0);
  const [labels, setLabels] = useState<'degree' | 'note'>('degree');
  const [bpm, setBpm] = useState(80);
  const [playIdx, setPlayIdx] = useState<number | null>(null);
  const [follow, setFollow] = useState<{ idx: number; wrong: number; start: number; miss: number | null } | null>(null);
  const [res, setRes] = useState<{ sec: number; wrong: number; best: boolean } | null>(null);
  const [best, setBest] = useState<Record<string, number>>({});
  const { reading, on, error, start, stop } = useMic();
  const stable = useRef({ last: 0, n: 0, lastJudged: -1 });
  const sc = scaleById(sid);
  usePracticeTimer('fretboard', playIdx !== null || follow !== null);
  useWakeLock(follow !== null, settings.wakeLock);
  useEffect(() => { kvGet<Record<string, number>>('scale-best', {}).then(setBest); }, []);
  useEffect(() => { try { localStorage.setItem('guitar-scale', sid); localStorage.setItem('guitar-scale-root', String(root)); } catch { /* 무시 */ } setPos((p) => (p === 'all' ? p : Math.min(p, positionCount(sc) - 1))); }, [sid, root]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { seq.stop(); synth.stopAll(); }, []);

  const box = useMemo(() => (pos === 'all' ? null : boxNotes(sc, root, pos, tuning)), [sc, root, pos, tuning]);
  const neck = useMemo(() => neckNotes(sc, root, tuning, 15), [sc, root, tuning]);
  // 오르고 내리기 (꼭대기 한 번)
  const run: FretNote[] = useMemo(() => (box ? [...box, ...box.slice(0, -1).reverse()] : []), [box]);
  const key = `${sid}:${root}:${pos}`;
  const lo = box ? Math.min(...box.map((n) => n.fret)) : 0, hi = box ? Math.max(...box.map((n) => n.fret)) : 15;
  const maxFret = Math.max(12, Math.min(15, hi + 1));

  const label = (n: FretNote) => (labels === 'degree' ? n.degree : NOTE_NAMES[n.midi % 12]);
  const dots: FbDot[] = [];
  if (box) {
    const inBox = new Set(box.map((n) => `${n.string}:${n.fret}`));
    neck.filter((n) => !inBox.has(`${n.string}:${n.fret}`) && n.fret <= maxFret).forEach((n) => dots.push({ string: n.string, fret: n.fret, label: label(n), cls: 'dim' }));
    const cur = playIdx !== null ? run[playIdx] : follow ? run[follow.idx] : null;
    box.forEach((n) => {
      const isCur = cur && cur.string === n.string && cur.fret === n.fret;
      const doneNote = follow && run.slice(0, follow.idx).some((x) => x.midi === n.midi);
      dots.push({ string: n.string, fret: n.fret, label: label(n), cls: isCur ? 'next' : doneNote ? 'done' : n.degree === 'R' ? 'root' : 'in' });
    });
  } else {
    neck.filter((n) => n.fret <= 15).forEach((n) => dots.push({ string: n.string, fret: n.fret, label: label(n), cls: n.degree === 'R' ? 'root' : 'in' }));
  }

  async function listen() {
    if (!run.length) return;
    stopAll();
    await synth.ready();
    await seq.start(run.map((n, i) => ({ beat: i / 2, data: i, play: (_c, w) => synth.note(n.midi, w, 0.75, n.string) })), {
      bpm, endBeats: run.length / 2 + 0.5, meterBeats: 4, countIn: 0, click: false,
      onEvent: (e) => setPlayIdx(e.data!), onEnd: () => setPlayIdx(null),
    });
    setPlayIdx(0);
  }
  async function begin() {
    stopAll();
    setRes(null);
    if (!(await start())) return;
    stable.current = { last: 0, n: 0, lastJudged: -1 };
    setFollow({ idx: 0, wrong: 0, start: performance.now(), miss: null });
  }
  function stopAll() { seq.stop(); synth.stopAll(); setPlayIdx(null); setFollow(null); stop(); }

  // 따라 치기: 지금 음이 안정되면 판정
  useEffect(() => {
    if (!follow || !reading?.freq) { if (!reading?.freq) stable.current.lastJudged = -1; return; }
    const m = Math.round(69 + 12 * Math.log2(reading.freq / settings.a4));
    const st = stable.current;
    if (m === st.last) st.n++; else { st.last = m; st.n = 1; }
    if (st.n < 3 || m === st.lastJudged) return;
    st.lastJudged = m;
    const want = run[follow.idx].midi;
    if (m === want) {
      const idx = follow.idx + 1;
      if (idx >= run.length) {
        const sec = (performance.now() - follow.start) / 1000;
        const isBest = !best[key] || sec < best[key];
        if (isBest && follow.wrong <= 2) { const nb = { ...best, [key]: sec }; setBest(nb); kvSet('scale-best', nb); }
        setRes({ sec, wrong: follow.wrong, best: isBest && follow.wrong <= 2 });
        recordReview({ key: `scale:${key}`, kind: 'scale', label: `${PC_NAMES[root]} ${sc.name} ${typeof pos === 'number' ? pos + 1 : ''}번`, nav: { tab: 'tuner', view: 'fretboard' }, note: `${sec.toFixed(1)}초 · 틀림 ${follow.wrong}` }, follow.wrong <= 2);
        setFollow(null); stop();
      } else setFollow({ ...follow, idx, miss: null });
    } else if (Math.abs(m - want) <= 12) {
      setFollow({ ...follow, wrong: follow.wrong + 1, miss: m });
    }
  }, [reading]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <div className="card">
        <div className="chips">{SCALES.filter((s) => s.level <= Math.max(level, 2)).map((s) => <button key={s.id} className={s.id === sid ? 'chip on' : 'chip'} onClick={() => setSid(s.id)}>{s.name}</button>)}</div>
        <div className="root-grid">{PC_NAMES.map((n, r) => <button key={n} className={r === root ? 'chip on' : 'chip'} onClick={() => setRoot(r)}>{n}</button>)}</div>
        <div className="chips">
          {Array.from({ length: positionCount(sc) }, (_, p) => <button key={p} className={pos === p ? 'chip on' : 'chip'} onClick={() => setPos(p)}>{p + 1}번</button>)}
          <button className={pos === 'all' ? 'chip on' : 'chip'} onClick={() => setPos('all')}>지판 전체</button>
        </div>
      </div>
      <div className="card">
        <div className="card-head">
          <b>{PC_NAMES[root]} {sc.name}{box ? ` · ${typeof pos === 'number' ? pos + 1 : ''}번 (${lo}~${hi}프렛)` : ''}</b>
          <div className="segmented small"><button className={labels === 'degree' ? 'on' : ''} onClick={() => setLabels('degree')}>도수</button><button className={labels === 'note' ? 'on' : ''} onClick={() => setLabels('note')}>음 이름</button></div>
        </div>
        <Fretboard maxFret={maxFret} dots={dots} tuning={tuning} box={box ? [lo, hi] : null} />
        {follow && (
          <div className="quiz-q" data-testid="scale-next">{follow.idx + 1} / {run.length} · {NOTE_NAMES[run[follow.idx].midi % 12]} <small className="muted">({6 - run[follow.idx].string}번 줄 {run[follow.idx].fret}프렛)</small></div>
        )}
        {follow?.miss != null && <p className="hint center">다른 음({NOTE_NAMES[((follow.miss % 12) + 12) % 12]})이 들렸어요</p>}
        {res && <div className={`result ${res.wrong <= 2 ? 'pass' : ''}`} data-testid="scale-result"><b>{res.sec.toFixed(1)}초 · 틀린 음 {res.wrong}{res.best ? ' · 최고 기록' : ''}</b><span className="small">{best[key] ? `이 모양 최고 ${best[key].toFixed(1)}초` : ''}</span></div>}
        {box && (
          <>
            <div className="row-setting">
              <span>템포</span>
              <button className="mini" onClick={() => setBpm(clampBpm(bpm - 8))}>−</button><b>{bpm}</b><button className="mini" onClick={() => setBpm(clampBpm(bpm + 8))}>+</button>
              <span className="muted small">8분음표</span>
            </div>
            {playIdx !== null || follow ? <button className="primary big stop" onClick={stopAll}>■ 그만</button> : (
              <div className="row-setting">
                <button className="secondary grow" onClick={listen}>▶ 오르내리기 듣기</button>
                <button className="primary grow" onClick={begin} data-testid="scale-follow">🎤 한 음씩 따라 치기</button>
              </div>
            )}
          </>
        )}
        {error && <p className="error">{error}</p>}
        <p className="hint">{box ? '진한 점이 이 포지션, 흐린 점은 이어지는 다른 포지션. 따라 치기는 오르고 내려오며 다음 음을 주황으로 보여 줘요.' : '포지션을 고르면 한 손 모양으로 연습할 수 있어요.'}{on ? '' : ''}</p>
      </div>
    </>
  );
}
