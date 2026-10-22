import { useEffect, useRef, useState } from 'react';
import { useSettings } from '../state/settings';
import { useMic } from '../state/useMic';
import { usePracticeTimer } from '../state/practice';
import { useWakeLock } from '../state/wakeLock';
import { CentsGauge } from '../components/Gauge';
import { TUNINGS, tuningById, stringNo } from '../guitar/tunings';
import { centsBetween, freqToNote, midiToFreq, midiName, NOTE_NAMES_KO } from '../audio/notes';
import { synth } from '../audio/synth';
import { Metronome } from './Metronome';
import { takeRequest } from '../state/navigate';

export function TunerTab() {
  const [view, setView] = useState<'tuner' | 'metronome'>(() => takeRequest('tuner')?.view ?? (localStorage.getItem('guitar-tuner-view') as 'tuner' | 'metronome') ?? 'tuner');
  const pick = (v: 'tuner' | 'metronome') => { setView(v); try { localStorage.setItem('guitar-tuner-view', v); } catch { /* 무시 */ } };
  return (
    <div className="page">
      <div className="segmented" role="tablist">
        <button className={view === 'tuner' ? 'on' : ''} onClick={() => pick('tuner')}>튜너</button>
        <button className={view === 'metronome' ? 'on' : ''} onClick={() => pick('metronome')}>메트로놈</button>
      </div>
      {view === 'tuner' ? <Tuner /> : <Metronome />}
    </div>
  );
}

function Tuner() {
  const { settings, update } = useSettings();
  const tuning = tuningById(settings.tuningId);
  const { reading, on, error, start, stop } = useMic();
  const [locked, setLocked] = useState<number | null>(null); // 고른 줄 (null = 자동)
  const [done, setDone] = useState<Set<number>>(new Set());
  const inTuneSince = useRef<number | null>(null);
  usePracticeTimer('tuner', on);
  useWakeLock(on, settings.wakeLock);

  const freq = reading?.freq ?? null;
  // 가장 가까운 줄 (자동) 또는 고른 줄
  let target = locked;
  if (target === null && freq) {
    let best = 0, bd = Infinity;
    tuning.midi.forEach((m, i) => { const d = Math.abs(centsBetween(freq, midiToFreq(m, settings.a4))); if (d < bd) { bd = d; best = i; } });
    target = best;
  }
  const targetMidi = target !== null ? tuning.midi[target] : null;
  const cents = freq && targetMidi !== null ? centsBetween(freq, midiToFreq(targetMidi, settings.a4)) : null;
  const note = freq ? freqToNote(freq, settings.a4) : null;
  const inTune = cents !== null && Math.abs(cents) <= 5;

  useEffect(() => {
    if (!inTune || target === null) { inTuneSince.current = null; return; }
    const now = performance.now();
    if (inTuneSince.current === null) inTuneSince.current = now;
    else if (now - inTuneSince.current > 900 && !done.has(target)) setDone((d) => new Set(d).add(target!));
  }, [inTune, target, reading, done]);

  const far = cents !== null && Math.abs(cents) > 50;
  return (
    <>
      <div className={`tuner-display ${inTune ? 'in-tune' : ''}`}>
        <div className="note-sub">{target !== null ? `${stringNo(target)}번 줄 · ${midiName(tuning.midi[target])}` : on ? '줄을 하나 튕겨 보세요' : '마이크를 켜면 시작해요'}</div>
        <div className="note-big">{note ? note.name : '—'}<small className="muted">{note ? note.octave : ''}</small></div>
        <div className="note-sub">{note ? NOTE_NAMES_KO[note.name] : ' '}</div>
        <div className="cents-num">{cents === null ? ' ' : far ? (cents > 0 ? '너무 높아요 ↓' : '너무 낮아요 ↑') : <>{Math.round(cents) > 0 ? '+' : ''}{Math.round(cents) || 0}<small> 센트</small></>}</div>
        <CentsGauge cents={far ? null : cents} />
        <div className="freq">{freq ? `${freq.toFixed(1)} Hz` : ''}{inTune && ' · 맞았어요'}</div>
      </div>
      {error && <p className="error">{error}</p>}
      <button className={`primary big ${on ? 'stop' : ''}`} onClick={() => (on ? stop() : start())}>{on ? '마이크 끄기' : '🎤 마이크 켜기'}</button>
      <div className="strings6">
        {tuning.midi.map((m, i) => (
          <button key={i} className={`string-btn ${target === i ? 'hl' : ''} ${done.has(i) ? 'done' : ''} ${locked === i ? 'locked' : ''}`}
            onClick={async () => { await synth.ready(); synth.note(m, 0, 0.9, i); setLocked(locked === i ? null : i); }}>
            <small>{stringNo(i)}번</small>
            <b>{midiName(m).replace(/\d/, '')}</b>
            <small>{done.has(i) ? '✓' : midiName(m)}</small>
          </button>
        ))}
      </div>
      <p className="hint">줄 버튼을 누르면 그 음이 나고 그 줄로 고정돼요 (한 번 더 누르면 자동). 1초 동안 ±5센트 안이면 ✓.</p>
      <div className="card">
        <div className="row-setting">
          <span>조율</span>
          <select value={settings.tuningId} onChange={(e) => { update({ tuningId: e.target.value }); setDone(new Set()); setLocked(null); }}>
            {TUNINGS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>
        </div>
        <div className="row-setting">
          <span>기준 A</span>
          <button className="mini" onClick={() => update({ a4: Math.max(430, settings.a4 - 1) })}>−</button>
          <b>{settings.a4} Hz</b>
          <button className="mini" onClick={() => update({ a4: Math.min(450, settings.a4 + 1) })}>+</button>
          {settings.a4 !== 440 && <button className="mini" onClick={() => update({ a4: 440 })}>440</button>}
        </div>
      </div>
    </>
  );
}
