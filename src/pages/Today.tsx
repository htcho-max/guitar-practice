import { useEffect, useState } from 'react';
import { useSettings } from '../state/settings';
import { navigate } from '../state/navigate';
import { onPracticeSaved } from '../state/practice';
import { db, kvGet, type PracticeRow, type ChangeRow, type FingerRun, type SongRow } from '../data/db';
import { localDate, addDays, streak, formatDuration } from '../data/dates';
import { LEVEL_NAMES, type Level } from '../data/settings';
import { CHANGE_PAIRS } from '../guitar/chords';
import { PATTERNS, PROGRESSIONS, patternById } from '../finger/patterns';
import { STRUMS, strumById } from '../strum/patterns';
import { dueReviews, allReviews, onReviewChange } from '../data/review';
import { weeklyMinutes, changeProgress, patternProgress } from '../data/trends';
import type { ReviewRow } from '../data/db';
import type { NavRequest } from '../state/navigate';

const KIND_NAMES: Record<string, string> = { tuner: '튜닝', metronome: '메트로놈', chord: '코드 잡기', change: '코드 전환', strum: '스트럼', fretboard: '지판', finger: '핑거', song: '곡' };

export function Today({ openSettings }: { openSettings: () => void }) {
  const { settings, update } = useSettings();
  const [rows, setRows] = useState<PracticeRow[]>([]);
  const [changes, setChanges] = useState<ChangeRow[]>([]);
  const [runs, setRuns] = useState<FingerRun[]>([]);
  const [lastSong, setLastSong] = useState<SongRow | null>(null);
  const [ladder, setLadder] = useState<Record<string, { bpm: number }>>({});
  const [strumLadder, setStrumLadder] = useState<Record<string, { bpm: number }>>({});
  const [due, setDue] = useState<ReviewRow[]>([]);
  const [reviewCount, setReviewCount] = useState(0);
  const [allChanges, setAllChanges] = useState<ChangeRow[]>([]);
  const [allRuns, setAllRuns] = useState<FingerRun[]>([]);
  const [showTrend, setShowTrend] = useState(false);
  const today = localDate();
  const load = () => {
    const from = addDays(today, -60);
    db.practice.where('date').aboveOrEqual(from).toArray().then(setRows).catch(() => {});
    db.changes.where('date').aboveOrEqual(addDays(today, -30)).toArray().then(setChanges).catch(() => {});
    db.fingerRuns.where('date').aboveOrEqual(addDays(today, -30)).toArray().then(setRuns).catch(() => {});
    db.songs.orderBy('openedAt').last().then((s) => setLastSong(s && s.openedAt ? s : null)).catch(() => {});
    kvGet('finger-ladder', {}).then(setLadder);
    kvGet('strum-ladder', {}).then(setStrumLadder);
    dueReviews().then(setDue);
    allReviews().then((r) => setReviewCount(r.length));
    db.changes.toArray().then(setAllChanges).catch(() => {});
    db.fingerRuns.toArray().then(setAllRuns).catch(() => {});
  };
  useEffect(() => { load(); const a = onPracticeSaved(load); const b = onReviewChange(load); return () => { a(); b(); }; }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!settings.level) return <LevelPicker onPick={(l) => update({ level: l })} />;
  const level = settings.level;
  const todaySec = rows.filter((r) => r.date === today).reduce((a, r) => a + r.sec, 0);
  const byKind = rows.filter((r) => r.date === today).reduce<Record<string, number>>((m, r) => ({ ...m, [r.kind]: (m[r.kind] ?? 0) + r.sec }), {});
  const days = new Set(rows.filter((r) => r.sec >= 60).map((r) => r.date));
  const st = streak(days, today);
  const goal = settings.goalMin * 60;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const perDay = (d: string) => rows.filter((r) => r.date === d).reduce((a, r) => a + r.sec, 0);
  const maxDay = Math.max(goal, ...week.map(perDay));

  // 오늘 할 일: 전환 쌍 (오늘 안 한 것 중 기록이 가장 적은 것), 패턴 (단계의 다음 것), 곡
  const pairs = CHANGE_PAIRS[level];
  const doneToday = new Set(changes.filter((c) => c.date === today).map((c) => c.pair));
  const bestOf = (k: string) => changes.filter((c) => c.pair === k).reduce((m, c) => Math.max(m, c.count), -1);
  const pair = pairs.filter((p) => !doneToday.has(p.join('|'))).sort((a, b) => bestOf(a.join('|')) - bestOf(b.join('|')))[0] ?? pairs[0];
  const pats = PATTERNS.filter((p) => p.level === level);
  const pat = pats.find((p) => (ladder[p.id]?.bpm ?? p.bpm[0]) < p.bpm[1]) ?? pats[0];
  const prog = PROGRESSIONS.filter((p) => p.level === level)[new Date().getDate() % PROGRESSIONS.filter((p) => p.level === level).length];
  const strs = STRUMS.filter((p) => p.level === level);
  const strum = strs.find((p) => (strumLadder[p.id]?.bpm ?? p.bpm[0]) < p.bpm[1]) ?? strs[0];
  const plan = [
    { key: 'tuner', title: '튜닝', sub: '여섯 줄 모두 ✓', go: () => navigate({ tab: 'tuner', view: 'tuner' }) },
    { key: 'change', title: `코드 전환 1분: ${pair[0]} ↔ ${pair[1]}`, sub: bestOf(pair.join('|')) >= 0 ? `최고 ${bestOf(pair.join('|'))}번` : '처음', go: () => navigate({ tab: 'chord', mode: 'change', pair }) },
    { key: 'strum', title: `스트럼: ${strum.name}`, sub: `${strumLadder[strum.id]?.bpm ?? strum.bpm[0]} BPM`, go: () => navigate({ tab: 'chord', mode: 'strum', strumId: strum.id }) },
    { key: 'finger', title: `핑거: ${pat.name}`, sub: `${prog.chords.join(' – ')} · ${ladder[pat.id]?.bpm ?? pat.bpm[0]} BPM`, go: () => navigate({ tab: 'finger', patternId: pat.id, chords: prog.chords }) },
    ...(level >= 2 ? [{ key: 'fretboard', title: level === 2 ? '지판 음 이름 외우기' : '스케일 모양', sub: level === 2 ? '20문제 · 0~12프렛' : '펜타토닉 한 포지션 따라 치기', go: () => navigate({ tab: 'tuner', view: 'fretboard', sub: level === 2 ? 'names' : 'scales' }) }] : []),
    { key: 'song', title: lastSong ? `곡: ${lastSong.title}` : '내 곡 넣기', sub: lastSong ? '이어서 연습' : '코드 악보·탭 붙여 넣기', go: () => navigate({ tab: 'song', songId: lastSong?.id }) },
  ];
  const recentRuns = runs.slice().sort((a, b) => b.at - a.at).slice(0, 4);

  return (
    <div className="page">
      <div className="card">
        <div className="today-head">
          <div>
            <div className="stat-line"><b>{formatDuration(todaySec)}</b> <span className="muted">/ 목표 {settings.goalMin}분</span></div>
            <div className="muted small">{st > 0 ? `${st}일 연속` : '오늘 첫 연습을 시작해요'} · {LEVEL_NAMES[level]}</div>
          </div>
          <button className="mini" onClick={openSettings} aria-label="설정">⚙</button>
        </div>
        <div className="progress"><div style={{ width: `${Math.min(100, (todaySec / goal) * 100)}%` }} /></div>
        {Object.keys(byKind).length > 0 && <div className="muted small">{Object.entries(byKind).map(([k, s]) => `${KIND_NAMES[k] ?? k} ${formatDuration(s)}`).join(' · ')}</div>}
      </div>
      {due.length > 0 && (
        <div className="card review-card" data-testid="review-card">
          <div className="card-head"><b>복습 {due.length}개</b><span className="muted small">지난번에 약했던 것 · 통과하면 간격이 늘어요</span></div>
          <ul className="plain">
            {due.slice(0, 6).map((r) => (
              <li key={r.key}>
                <button className="review-item" onClick={() => navigate(r.nav as NavRequest)}>
                  <span className="grow"><b>{r.label}</b><span className="muted small">{r.note} · 상자 {r.box}/5</span></span>
                  <span className="muted">›</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      <h3>오늘 할 일</h3>
      <ol className="plan">
        {plan.map((p, i) => (
          <li key={p.key}>
            <button className="plan-item" onClick={p.go}>
              <span className="plan-n">{i + 1}</span>
              <span className="grow"><b>{p.title}</b><span className="muted small">{p.sub}</span></span>
              <span className={byKind[p.key] ? 'plan-done' : 'muted'}>{byKind[p.key] ? '✓' : '›'}</span>
            </button>
          </li>
        ))}
      </ol>
      <h3>이번 주</h3>
      <div className="week">
        {week.map((d) => (
          <div key={d} className="week-day">
            <div className="week-bar"><div style={{ height: `${(perDay(d) / maxDay) * 100}%` }} className={perDay(d) >= goal ? 'met' : ''} /></div>
            <span className={d === today ? 'today' : ''}>{['일', '월', '화', '수', '목', '금', '토'][new Date(d + 'T12:00').getDay()]}</span>
          </div>
        ))}
      </div>
      <button className="link small" onClick={() => setShowTrend(!showTrend)} data-testid="trend-toggle">{showTrend ? '▾' : '▸'} 주별 추이 · 발전 기록{reviewCount ? ` · 복습함 ${reviewCount}개` : ''}</button>
      {showTrend && <Trends rows={rows} today={today} changes={allChanges} runs={allRuns} goal={settings.goalMin} />}
      {recentRuns.length > 0 && (
        <>
          <h3>최근 따라 치기</h3>
          <ul className="plain small">
            {recentRuns.map((r) => <li key={r.id}>{r.patternId.startsWith('strum:') ? `스트럼 ${strumById(r.patternId.slice(6)).name}` : patternById(r.patternId).name} · {r.bpm} BPM · 맞춘 {Math.round(r.hitRate * 100)}% · 흔들림 ±{Math.round(r.sdMs)}ms {r.passed ? '✓' : ''}</li>)}
          </ul>
        </>
      )}
    </div>
  );
}

function LevelPicker({ onPick }: { onPick: (l: Level) => void }) {
  const items: { l: Level; title: string; sub: string }[] = [
    { l: 1, title: '입문', sub: '기타를 처음 잡거나 코드 몇 개만 알아요. C G D Em Am 부터.' },
    { l: 2, title: '초급', sub: '기본 코드는 잡아요. F·7화음, 아르페지오·교대 베이스를 늘리고 싶어요.' },
    { l: 3, title: '중급', sub: '바레 코드가 돼요. 트래비스 피킹·핀치·퍼커시브와 곡 연습을.' },
  ];
  return (
    <div className="page">
      <div className="card">
        <b>어디서부터 시작할까요?</b>
        <p className="hint">고른 단계에 맞는 코드·전환 쌍·핑거 패턴을 먼저 보여 줘요. 나중에 설정에서 바꿀 수 있어요.</p>
      </div>
      {items.map((it) => (
        <button key={it.l} className="level-btn" onClick={() => onPick(it.l)} data-testid={`level-${it.l}`}>
          <b>{it.title}</b><span className="muted small">{it.sub}</span>
        </button>
      ))}
    </div>
  );
}

function Trends({ rows, today, changes, runs, goal }: { rows: PracticeRow[]; today: string; changes: ChangeRow[]; runs: FingerRun[]; goal: number }) {
  const weeks = weeklyMinutes(rows, today, 8);
  const max = Math.max(goal * 7, ...weeks.map((w) => w.min), 1);
  const cp = changeProgress(changes).slice(0, 4);
  const pp = patternProgress(runs, (id) => (id.startsWith('strum:') ? `스트럼 ${strumById(id.slice(6)).name}` : patternById(id).name)).slice(0, 4);
  return (
    <div className="card" data-testid="trends">
      <b>주별 연습 시간 (분)</b>
      <div className="weeks8">
        {weeks.map((w) => (
          <div key={w.week} className="week-col">
            <span className="small">{w.min || ''}</span>
            <div className="week-bar"><div style={{ height: `${(w.min / max) * 100}%` }} className={w.min >= goal * 7 ? 'met' : ''} /></div>
            <span className="muted small">{Number(w.week.slice(5, 7))}/{Number(w.week.slice(8))}</span>
          </div>
        ))}
      </div>
      {cp.length > 0 && <><b className="small">1분 전환 (처음 → 최고)</b><ul className="plain small">{cp.map((p) => <li key={p.label}>{p.label}: {p.first} → <b>{p.best}</b>번 <span className="muted">({p.n}번 함)</span></li>)}</ul></>}
      {pp.length > 0 && <><b className="small">패턴 템포 (처음 → 통과한 최고)</b><ul className="plain small">{pp.map((p) => <li key={p.label}>{p.label}: {p.first} → <b>{p.best || '아직'}</b>{p.best ? ' BPM' : ''} <span className="muted">({p.n}번)</span></li>)}</ul></>}
      {!cp.length && !pp.length && <span className="muted small">1분 전환이나 따라 치기를 하면 발전 기록이 쌓여요.</span>}
    </div>
  );
}
