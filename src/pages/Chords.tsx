import { useEffect, useMemo, useState } from 'react';
import { CHORD_TYPES, shapesFor, shapeMidis, chordPcs, shapeName, LEVEL_SETS, type ChordShape } from '../guitar/chords';
import { parseChord, shapesForTuning } from '../guitar/symbols';
import { tuningById } from '../guitar/tunings';
import { PC_NAMES } from '../audio/notes';
import { ChordDiagram, type StringMark } from '../components/ChordDiagram';
import { useSettings } from '../state/settings';
import { useMic } from '../state/useMic';
import { useChordCheck, useStringCheck } from '../state/useChordCheck';
import { usePracticeTimer } from '../state/practice';
import { synth } from '../audio/synth';
import { takeRequest } from '../state/navigate';
import { ChangePractice } from './ChangePractice';
import { StrumPractice } from './Strum';
import { LEVEL_NAMES } from '../data/settings';

export function ChordsTab() {
  const req = useMemo(() => takeRequest('chord'), []);
  type Mode = 'dict' | 'change' | 'strum';
  const [mode, setMode] = useState<Mode>(req?.mode ?? ((localStorage.getItem('guitar-chord-mode') as Mode) || 'dict'));
  const pick = (m: Mode) => { setMode(m); try { localStorage.setItem('guitar-chord-mode', m); } catch { /* 무시 */ } };
  return (
    <div className="page">
      <div className="segmented">
        <button className={mode === 'dict' ? 'on' : ''} onClick={() => pick('dict')}>코드 사전</button>
        <button className={mode === 'change' ? 'on' : ''} onClick={() => pick('change')}>전환 연습</button>
        <button className={mode === 'strum' ? 'on' : ''} onClick={() => pick('strum')}>스트럼</button>
      </div>
      {mode === 'dict' ? <ChordDict initial={req?.chord} /> : mode === 'change' ? <ChangePractice initialPair={req?.pair} /> : <StrumPractice initial={req?.strumId} />}
    </div>
  );
}

export async function strumShape(shape: ChordShape, tuning: number[], dir: 'down' | 'up' = 'down') {
  const ctx = await synth.ready();
  synth.strum(shapeMidis(shape, tuning), ctx.currentTime + 0.02, dir);
}
export async function arpShape(shape: ChordShape, tuning: number[]) {
  const ctx = await synth.ready();
  shapeMidis(shape, tuning).forEach((m, i, arr) => {
    if (m === null) return;
    const k = arr.slice(0, i).filter((x) => x !== null).length;
    synth.note(m, ctx.currentTime + 0.02 + k * 0.28, 0.8, i);
  });
}

function ChordDict({ initial }: { initial?: string }) {
  const { settings, update } = useSettings();
  const tuning = tuningById(settings.tuningId).midi;
  const init = initial ? parseChord(initial) : null;
  const [root, setRoot] = useState(init?.root ?? Number(localStorage.getItem('guitar-dict-root') ?? 0));
  const [suffix, setSuffix] = useState(init?.suffix ?? localStorage.getItem('guitar-dict-suffix') ?? '');
  const [bass, setBass] = useState<number | undefined>(init?.bass);
  const [idx, setIdx] = useState(0);
  const [check, setCheck] = useState<'off' | 'strum' | 'strings'>('off');
  useEffect(() => { try { localStorage.setItem('guitar-dict-root', String(root)); localStorage.setItem('guitar-dict-suffix', suffix); } catch { /* 무시 */ } setIdx(0); }, [root, suffix, bass]);
  const shapes = shapesForTuning(root, suffix, bass, tuning);
  const list = shapes.length ? shapes : shapesForTuning(root, suffix, undefined, tuning);
  const shape = list[Math.min(idx, list.length - 1)];
  const isStd = settings.tuningId === 'std';
  const level = settings.level ?? 1;

  return (
    <>
      <div className="card">
        <div className="card-head"><b>{LEVEL_NAMES[level]} 코드</b><span className="muted small">눌러서 열기</span></div>
        <div className="chips scroll-x">
          {LEVEL_SETS[level].map((n) => {
            const c = parseChord(n)!;
            const on = c.root === root && c.suffix === suffix && c.bass === bass;
            return <button key={n} className={on ? 'chip on' : 'chip'} onClick={() => { setRoot(c.root); setSuffix(c.suffix); setBass(c.bass); }}>{n}</button>;
          })}
        </div>
      </div>
      <div className="root-grid">
        {PC_NAMES.map((n, r) => <button key={n} className={r === root && bass === undefined ? 'chip on' : 'chip'} onClick={() => { setRoot(r); setBass(undefined); }}>{n}</button>)}
      </div>
      <div className="chips scroll-x">
        {CHORD_TYPES.map((t) => <button key={t.suffix} className={t.suffix === suffix ? 'chip on' : 'chip'} onClick={() => { setSuffix(t.suffix); setBass(undefined); }}>{PC_NAMES[root]}{t.suffix || ''}<small className="muted"> {t.name}</small></button>)}
      </div>
      {shape ? (
        <div className="card chord-card">
          <div className="chord-main">
            <ChordDiagram shape={shape} labels={settings.chordLabels} width={170} tuning={tuning} />
            <div className="chord-side">
              <div className="muted small">{list.length > 1 ? `모양 ${Math.min(idx, list.length - 1) + 1} / ${list.length}` : '모양 1개'}</div>
              <div className="muted small">{shape.form === 'open' ? '개방 코드' : `${shape.form === 'E' ? '6' : '5'}번 줄 근음 바레`}</div>
              {list.length > 1 && (
                <div className="row-setting">
                  <button className="mini" onClick={() => setIdx((i) => (i - 1 + list.length) % list.length)} aria-label="이전 모양">◀</button>
                  <button className="mini" onClick={() => setIdx((i) => (i + 1) % list.length)} aria-label="다음 모양">▶</button>
                </div>
              )}
              <button className="secondary" onClick={() => strumShape(shape, tuning)}>▶ 긁기</button>
              <button className="secondary" onClick={() => arpShape(shape, tuning)}>한 줄씩 듣기</button>
            </div>
          </div>
          <div className="segmented small">
            {(['finger', 'degree', 'note'] as const).map((l) => <button key={l} className={settings.chordLabels === l ? 'on' : ''} onClick={() => update({ chordLabels: l })}>{{ finger: '손가락', degree: '도수', note: '음 이름' }[l]}</button>)}
          </div>
          {!isStd && <p className="hint">지금 조율({tuningById(settings.tuningId).name})로 음을 계산해요. 이 조율에 맞는 자리를 찾아서 보여 줘요 (손가락 번호는 추천).</p>}
        </div>
      ) : <p className="muted">이 코드는 아직 모양이 없어요.</p>}
      {shape && <ChordCheck shape={shape} tuning={tuning} mode={check} setMode={setCheck} />}
    </>
  );
}

function ChordCheck({ shape, tuning, mode, setMode }: { shape: ChordShape; tuning: number[]; mode: 'off' | 'strum' | 'strings'; setMode: (m: 'off' | 'strum' | 'strings') => void }) {
  const { settings } = useSettings();
  const { on, error, start, stop } = useMic({ reading: false });
  const pcs = chordPcs(shape.root, shape.suffix);
  const { verdict, listening } = useChordCheck(on && mode === 'strum', pcs, shape.bass, shapeName(shape));
  const midis = shapeMidis(shape, tuning);
  const strings = useStringCheck(on && mode === 'strings', midis, settings.a4);
  usePracticeTimer('chord', on);
  const go = async (m: 'strum' | 'strings') => { if (await start()) { setMode(m); strings.reset(); } };
  const off = () => { stop(); setMode('off'); };
  const marks: StringMark[] = midis.map((m, i) => {
    if (m === null) return null;
    const r = strings.results[i];
    if (r) return r.state === 'ok' ? 'ok' : 'bad';
    return strings.current === i ? 'now' : null;
  });
  return (
    <div className="card">
      <div className="card-head"><b>잡아 보기</b>{on && <button className="mini" onClick={off}>마이크 끄기</button>}</div>
      {!on || mode === 'off' ? (
        <>
          <p className="hint">코드를 잡고 마이크를 켜세요. 긁으면 맞게 들리는지, 한 줄씩 튕기면 줄마다 확인해요.</p>
          <div className="row-setting">
            <button className="primary" onClick={() => go('strum')}>🎤 긁어서 확인</button>
            <button className="secondary" onClick={() => go('strings')}>한 줄씩 확인</button>
          </div>
        </>
      ) : mode === 'strum' ? (
        <div className={`verdict ${verdict?.verdict ?? ''}`} data-testid="chord-verdict">
          {listening ? <b>듣는 중…</b> : !verdict ? <b>{shapeName(shape)} 를 한 번 긁어 보세요</b> : (
            <>
              <b>{verdict.verdict === 'ok' ? '✓ 맞게 들려요' : verdict.verdict === 'close' ? '△ 거의 맞아요' : '✗ 다르게 들려요'}</b>
              <span className="small">들린 코드: {verdict.heard} · 일치 {Math.round(verdict.score * 100)}%</span>
              {verdict.missing.length > 0 && <span className="small">잘 안 들리는 음: {verdict.missing.map((p) => PC_NAMES[p]).join(', ')} — 그 음을 짚은 손가락이 옆 줄에 닿거나 덜 눌렸는지 보세요.</span>}
              {verdict.extra.length > 0 && <span className="small">코드에 없는 음: {verdict.extra.map((p) => PC_NAMES[p]).join(', ')} — 안 치는 줄(×)이 울렸을 수 있어요.</span>}
            </>
          )}
          <button className="link small" onClick={() => setMode('strings')}>한 줄씩 확인으로 →</button>
        </div>
      ) : (
        <div className="string-check">
          <ChordDiagram shape={shape} labels="finger" width={170} tuning={tuning} marks={marks} title={false} />
          <div className="string-check-side">
            {strings.done ? <b>다 했어요</b> : <b>{strings.current !== null ? `${6 - strings.current}번 줄을 튕기세요` : ''}</b>}
            <ul className="plain small">
              {midis.map((m, i) => m !== null && strings.results[i] && (
                <li key={i}>{6 - i}번 줄: {strings.results[i]!.state === 'ok' ? '✓ 맞음' : strings.results[i]!.state === 'none' ? '소리가 흐려요 (손가락이 덜 눌림?)' : `다른 음 (${strings.results[i]!.heard})`}</li>
              ))}
            </ul>
            <button className="secondary" onClick={strings.reset}>처음부터</button>
            <button className="link small" onClick={() => setMode('strum')}>← 긁어서 확인</button>
          </div>
        </div>
      )}
      {error && <p className="error">{error}</p>}
    </div>
  );
}
