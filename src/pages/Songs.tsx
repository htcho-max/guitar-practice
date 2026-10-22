import { useEffect, useMemo, useRef, useState } from 'react';
import { db, type SongRow } from '../data/db';
import { addSong, saveSongText } from '../data/songs';
import { SAMPLE_SONGS, FORMAT_HELP } from '../song/samples';
import { parseSong, type Block, type ParsedSong } from '../song/parse';
import { buildTimeline, defaultStrum, type TimelineItem } from '../song/timeline';
import { parseChord, shapeForSymbol, transposeName } from '../guitar/symbols';
import { shapeMidis, type ChordShape } from '../guitar/chords';
import { tuningById } from '../guitar/tunings';
import { PATTERNS, patternById, realize } from '../finger/patterns';
import { ChordDiagram } from '../components/ChordDiagram';
import { Sequencer, type SeqEvent } from '../audio/sequencer';
import { synth } from '../audio/synth';
import { useSettings } from '../state/settings';
import { usePracticeTimer } from '../state/practice';
import { useWakeLock } from '../state/wakeLock';
import { setBusy } from '../state/busy';
import { useBackLayer } from '../state/back';
import { takeRequest } from '../state/navigate';
import { clampBpm } from '../audio/schedule';

export function SongsTab() {
  const req = useMemo(() => takeRequest('song'), []);
  const [songs, setSongs] = useState<SongRow[] | null>(null);
  const [openId, setOpenId] = useState<string | null>(req?.songId ?? null);
  const [editing, setEditing] = useState<SongRow | 'new' | null>(null);
  const [q, setQ] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const load = () => db.songs.toArray().then((r) => setSongs(r.sort((a, b) => (b.openedAt || b.updatedAt) - (a.openedAt || a.updatedAt)))).catch(() => setSongs([]));
  useEffect(() => { load(); }, []);
  useBackLayer(openId !== null && !editing, () => setOpenId(null));
  useBackLayer(editing !== null, () => setEditing(null));
  const open = songs?.find((s) => s.id === openId) ?? null;

  async function importFiles(files: FileList | null) {
    if (!files?.length) return;
    let n = 0;
    const bad: string[] = [];
    for (const f of Array.from(files)) {
      try { const text = await f.text(); await addSong(text, f.name.replace(/\.[^.]+$/, '')); n++; } catch { bad.push(f.name); }
    }
    setMsg(`곡 ${n}개를 불러왔어요.${bad.length ? ` 못 읽은 파일: ${bad.join(', ')}` : ''}`);
    load();
  }
  async function addSamples() {
    const have = new Set((songs ?? []).map((s) => s.title));
    for (const s of SAMPLE_SONGS) if (!have.has(s.title)) await addSong(s.text);
    load();
  }

  if (editing) {
    return <SongEditor song={editing === 'new' ? null : editing} onClose={(id) => { setEditing(null); load(); if (id) setOpenId(id); }} />;
  }
  if (open) {
    return <SongView key={open.id} song={open} onBack={() => setOpenId(null)} onEdit={() => setEditing(open)} onChange={load} />;
  }
  const list = (songs ?? []).filter((s) => !q || (s.title + s.artist).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <div className="row-setting">
        <button className="primary grow" onClick={() => setEditing('new')}>＋ 새 곡</button>
        <label className="button secondary grow">
          파일 불러오기
          <input type="file" accept=".txt,.cho,.chopro,.pro,.crd,.chordpro,text/plain" multiple hidden onChange={(e) => { importFiles(e.target.files); e.target.value = ''; }} data-testid="song-file" />
        </label>
      </div>
      {msg && <p className="hint" role="status">{msg}</p>}
      {(songs?.length ?? 0) > 5 && <input className="text search" placeholder="곡 찾기" value={q} onChange={(e) => setQ(e.target.value)} />}
      {songs && songs.length === 0 && (
        <div className="card">
          <b>아직 곡이 없어요</b>
          <p className="hint">인터넷 코드 악보나 탭을 복사해서 ＋ 새 곡에 붙여 넣으면 돼요. 형식을 보려면 예시 곡을 넣어 보세요.</p>
          <button className="secondary" onClick={addSamples}>예시 곡 3개 넣기 (아리랑 · Amazing Grace · 로망스)</button>
        </div>
      )}
      <ul className="song-list">
        {list.map((s) => (
          <li key={s.id}>
            <button className="song-item" onClick={() => { setOpenId(s.id); db.songs.update(s.id, { openedAt: Date.now() }).catch(() => {}); }}>
              <b>{s.title}</b><span className="muted small">{s.artist}</span>
            </button>
          </li>
        ))}
      </ul>
      {songs && songs.length > 0 && !songs.some((s) => SAMPLE_SONGS.some((x) => x.title === s.title)) && <button className="link small muted" onClick={addSamples}>예시 곡 넣기</button>}
    </div>
  );
}

function SongEditor({ song, onClose }: { song: SongRow | null; onClose: (openId?: string) => void }) {
  const [text, setText] = useState(song?.text ?? '');
  const [help, setHelp] = useState(!song);
  const parsed = useMemo(() => parseSong(text), [text]);
  const chordCount = parsed.blocks.reduce((n, b) => n + (b.kind === 'line' ? b.segs.filter((s) => s.chord).length : b.kind === 'bars' ? b.bars.flat().length : 0), 0);
  const tabCount = parsed.blocks.filter((b) => b.kind === 'tab').length;
  const save = async () => {
    if (!text.trim()) return;
    if (song) { await saveSongText(song.id, text); onClose(song.id); }
    else { const r = await addSong(text); onClose(r.id); }
  };
  const del = async () => {
    if (song && confirm(`"${song.title}" 을(를) 지울까요?`)) { await db.songs.delete(song.id); onClose(); }
  };
  return (
    <div className="page">
      <div className="card-head"><b>{song ? '곡 고치기' : '새 곡'}</b><button className="mini" onClick={() => setHelp(!help)}>형식 도움말</button></div>
      {help && <pre className="help-pre">{FORMAT_HELP}</pre>}
      <textarea className="song-text" value={text} onChange={(e) => setText(e.target.value)} rows={18} spellCheck={false} placeholder={'{title: 곡 제목}\n{artist: 가수}\n\nC         G\n코드 악보나 탭을 여기에 붙여 넣으세요'} data-testid="song-textarea" />
      <p className="hint">알아본 것: 제목 「{parsed.meta.title || '(첫 줄)'}」 · 코드 {chordCount}개 · 탭 {tabCount}묶음{parsed.meta.capo ? ` · 카포 ${parsed.meta.capo}` : ''}</p>
      <div className="row-setting">
        <button className="primary grow" onClick={save} disabled={!text.trim()}>저장</button>
        <button className="secondary" onClick={() => onClose(song?.id)}>취소</button>
        {song && <button className="danger" onClick={del}>지우기</button>}
      </div>
    </div>
  );
}

type Vis = { block: number; seg?: number; event?: number };
const player = new Sequencer<Vis>();

function SongView({ song, onBack, onEdit, onChange }: { song: SongRow; onBack: () => void; onEdit: () => void; onChange: () => void }) {
  const { settings } = useSettings();
  const tuning = tuningById(settings.tuningId).midi;
  const parsed = useMemo(() => parseSong(song.text), [song.text]);
  const meta = parsed.meta;
  const [capo, setCapo] = useState(song.capo ?? meta.capo);
  const [transpose, setTranspose] = useState(song.transpose);
  const [bpm, setBpm] = useState(song.bpm ?? (meta.tempo || 80));
  const [accomp, setAccomp] = useState<SongRow['accomp']>(song.accomp ?? 'strum');
  const [fingerId, setFingerId] = useState(meta.finger || (meta.beats === 3 ? 'waltz' : 'pima'));
  const [strum, setStrum] = useState(meta.strum || defaultStrum(meta.beats));
  const [font, setFont] = useState(() => Number(localStorage.getItem('guitar-song-font') ?? 17));
  const [autoScroll, setAutoScroll] = useState(true);
  const [click, setClick] = useState(false);
  const [now, setNow] = useState<Vis | null>(null);
  const [playing, setPlaying] = useState(false);
  const [diagram, setDiagram] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  usePracticeTimer('song', playing);
  useWakeLock(playing, settings.wakeLock);
  useEffect(() => { setBusy('song', playing); return () => setBusy('song', false); }, [playing]);
  useEffect(() => () => { player.stop(); synth.stopAll(); }, []);
  useBackLayer(diagram !== null, () => setDiagram(null));
  // 저장 (곡마다)
  useEffect(() => {
    const id = setTimeout(() => { db.songs.update(song.id, { capo, transpose, bpm, accomp }).catch(() => {}); }, 400);
    return () => clearTimeout(id);
  }, [capo, transpose, bpm, accomp, song.id]);
  useEffect(() => { try { localStorage.setItem('guitar-song-font', String(font)); } catch { /* 무시 */ } }, [font]);

  // 잡는 모양 = 적힌 코드 + 곡 카포 + 조 옮김 − 지금 카포
  const shift = meta.capo + transpose - capo;
  const shown = (name: string) => transposeName(name, shift);
  const sounding = (name: string) => transposeName(name, meta.capo + transpose);
  const shapeCache = useRef(new Map<string, ChordShape | null>());
  const shapeOf = (name: string): ChordShape | null => {
    if (!shapeCache.current.has(name)) { const c = parseChord(name); shapeCache.current.set(name, c ? shapeForSymbol(c) : null); }
    return shapeCache.current.get(name)!;
  };
  const timeline = useMemo(() => buildTimeline(parsed), [parsed]);
  const chordsUsed = useMemo(() => [...new Set(timeline.items.filter((i): i is TimelineItem & { kind: 'chord' } => i.kind === 'chord').map((i) => shown(i.chord)))], [timeline, shift]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (playing) stop(); }, [capo, transpose, bpm, accomp, fingerId, strum, click]); // eslint-disable-line react-hooks/exhaustive-deps

  function buildEvents(): SeqEvent<Vis>[] {
    const out: SeqEvent<Vis>[] = [];
    const bar = meta.beats;
    const pat = patternById(fingerId);
    const strumPat = strum.replace(/\s/g, '') || defaultStrum(bar);
    const L = strumPat.length;
    const slot = bar / L;
    for (const it of timeline.items) {
      if (it.kind === 'tab') {
        out.push({ beat: it.beat, data: { block: it.block, event: it.event }, play: (_c, when) => {
          it.notes.forEach((n) => { if (n.dead) synth.chuck(when, 0.5); else synth.note(tuning[n.string] + n.fret + meta.capo + transpose, when, 0.8, n.string); });
        } });
        continue;
      }
      const shape = shapeOf(shown(it.chord));
      out.push({ beat: it.beat, data: { block: it.block, seg: it.seg } });
      if (!shape || accomp === 'none') continue;
      const midis = shapeMidis(shape, tuning, capo);
      const end = it.beat + it.dur;
      if (accomp === 'once') {
        out.push({ beat: it.beat, play: (_c, w) => synth.strum(midis, w, 'down', 0.75) });
      } else if (accomp === 'strum') {
        for (let g = Math.ceil(it.beat / slot - 1e-6); g * slot < end - 1e-6; g++) {
          let ch = strumPat[g % L];
          if (g * slot - it.beat < 1e-6 && ch !== 'D' && ch !== 'x') ch = 'D'; // 코드가 바뀌는 자리는 내려 긋기
          const b = g * slot;
          if (ch === 'D' || ch === 'd') out.push({ beat: b, play: (_c, w) => synth.strum(midis, w, 'down', g % L === 0 ? 0.85 : 0.7) });
          else if (ch === 'U' || ch === 'u') out.push({ beat: b, play: (_c, w) => synth.strum(midis, w, 'up', 0.6) });
          else if (ch === 'x' || ch === 'X') out.push({ beat: b, play: (_c, w) => synth.chuck(w) });
        }
      } else {
        const steps = realize(pat, shape, tuning, capo);
        const per = pat.beats;
        for (let bs = Math.floor(it.beat / per) * per; bs < end; bs += per) {
          for (const st of steps) {
            const b = bs + st.beat;
            if (b < it.beat - 1e-6 || b >= end - 1e-6) continue;
            out.push({ beat: b, play: (_c, w) => { st.notes.forEach((n) => synth.note(n.midi, w, st.slot === 0 ? 0.85 : 0.7, n.string)); if (st.hit) synth.hit(w); } });
          }
        }
      }
    }
    return out;
  }

  async function play() {
    if (!timeline.items.length) return;
    await synth.ready();
    await player.start(buildEvents(), {
      bpm, endBeats: timeline.beats, meterBeats: meta.beats, countIn: meta.beats, click,
      clickSound: settings.clickSound, clickVolume: settings.clickVolume,
      onEvent: (e) => { if (e.data) setNow(e.data); },
      onEnd: () => { setPlaying(false); setNow(null); },
    });
    setPlaying(true);
  }
  function stop() { player.stop(); synth.stopAll(); setPlaying(false); setNow(null); }

  // 자동 스크롤
  useEffect(() => {
    if (!autoScroll || !now) return;
    const el = bodyRef.current?.querySelector('.now');
    el?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [now, autoScroll]);

  const strumBad = accomp === 'strum' && /[^DUdux\-X]/.test(strum);
  return (
    <div className="page song-page">
      <div className="song-head">
        <button className="mini" onClick={onBack} aria-label="목록으로">◀</button>
        <div className="grow"><b className="song-title">{song.title}</b>{song.artist && <span className="muted small"> · {song.artist}</span>}</div>
        <button className="mini" onClick={onEdit}>고치기</button>
      </div>
      <div className="song-controls">
        <div className="ctl"><span>카포</span><button className="mini" onClick={() => setCapo(Math.max(0, capo - 1))}>−</button><b>{capo}</b><button className="mini" onClick={() => setCapo(Math.min(9, capo + 1))}>+</button></div>
        <div className="ctl"><span>조</span><button className="mini" onClick={() => setTranspose(transpose - 1)}>−</button><b>{transpose > 0 ? `+${transpose}` : transpose}</b><button className="mini" onClick={() => setTranspose(transpose + 1)}>+</button></div>
        <div className="ctl"><span>템포</span><button className="mini" onClick={() => setBpm(clampBpm(bpm - 4))}>−</button><b>{bpm}</b><button className="mini" onClick={() => setBpm(clampBpm(bpm + 4))}>+</button></div>
        <div className="ctl"><span>글씨</span><button className="mini" onClick={() => setFont(Math.max(12, font - 1))}>가−</button><button className="mini" onClick={() => setFont(Math.min(30, font + 1))}>가+</button></div>
      </div>
      {(capo !== meta.capo || transpose !== 0) && <p className="hint">소리: {chordsUsed.slice(0, 6).map((c) => sounding(transposeName(c, -shift))).join(' ')} {capo ? `· 카포 ${capo}프렛에서 위 모양으로` : ''}</p>}
      <div className="row-setting small">
        <span>반주</span>
        <select value={accomp} onChange={(e) => setAccomp(e.target.value as SongRow['accomp'])}>
          <option value="strum">긁기 패턴</option>
          <option value="finger">핑거 패턴</option>
          <option value="once">코드마다 한 번</option>
          <option value="none">소리 없이 (따라가기만)</option>
        </select>
        {accomp === 'strum' && <input className="text mono" value={strum} onChange={(e) => setStrum(e.target.value)} aria-label="긁기 패턴" style={{ maxWidth: 130 }} />}
        {accomp === 'finger' && <select value={fingerId} onChange={(e) => setFingerId(e.target.value)}>{PATTERNS.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        <label><input type="checkbox" checked={click} onChange={(e) => setClick(e.target.checked)} /> 클릭</label>
        <label><input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} /> 따라 내리기</label>
      </div>
      {strumBad && <p className="hint">긁기 패턴은 D(내려) U(올려) -(쉼) x(뮤트) 로 한 마디를 적어요.</p>}
      {chordsUsed.length > 0 && (
        <div className="chips scroll-x">
          {chordsUsed.map((c) => <button key={c} className="chip" onClick={() => setDiagram(c)}>{c}</button>)}
        </div>
      )}
      <div className="song-body" ref={bodyRef} style={{ fontSize: font }}>
        {parsed.blocks.map((b, bi) => <SongBlock key={bi} block={b} bi={bi} now={now} shown={shown} onChord={setDiagram} meta={meta} />)}
      </div>
      <div className="play-float">
        <button className={`primary ${playing ? 'stop' : ''}`} onClick={() => (playing ? stop() : play())} disabled={!timeline.items.length}>{playing ? '■ 정지' : '▶ 재생'}</button>
        <span className="muted small">{timeline.items.length ? `${Math.round(timeline.beats / meta.beats)}마디 · ${meta.beats}/${meta.unit}` : '재생할 코드·탭이 없어요'}</span>
      </div>
      {diagram && (
        <div className="sheet-backdrop" onClick={() => setDiagram(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {shapeOf(diagram) ? <ChordDiagram shape={{ ...shapeOf(diagram)! }} labels={settings.chordLabels} width={220} tuning={tuning} /> : <p>{diagram}: 모양을 몰라요</p>}
            <div className="row-setting">
              {shapeOf(diagram) && <button className="secondary grow" onClick={async () => { const ctx = await synth.ready(); synth.strum(shapeMidis(shapeOf(diagram)!, tuning, capo), ctx.currentTime + 0.02); }}>▶ 긁기</button>}
              <button className="secondary grow" onClick={() => setDiagram(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}
      <button className="link small muted" onClick={onChange} hidden>새로고침</button>
    </div>
  );
}

function SongBlock({ block: b, bi, now, shown, onChord, meta }: { block: Block; bi: number; now: Vis | null; shown: (n: string) => string; onChord: (c: string) => void; meta: ParsedSong['meta'] }) {
  if (b.kind === 'empty') return <div className="sb-empty" />;
  if (b.kind === 'section') return <div className="sb-section">{b.label}</div>;
  if (b.kind === 'comment') return <div className="sb-comment">{b.text}</div>;
  if (b.kind === 'line') {
    const hasChord = b.segs.some((s) => s.chord);
    return (
      <div className={`sb-line ${hasChord ? 'with-chords' : ''}`}>
        {b.segs.map((s, si) => (
          <span key={si} className={`sb-seg ${now?.block === bi && now.seg === si ? 'now' : ''}`}>
            {hasChord && <button className="sb-chord" onClick={() => s.chord && onChord(shown(s.chord))} tabIndex={s.chord ? 0 : -1}>{s.chord ? shown(s.chord) : ' '}</button>}
            <span className="sb-text">{s.text || (s.chord ? '  ' : '')}</span>
          </span>
        ))}
      </div>
    );
  }
  if (b.kind === 'bars') {
    let k = 0;
    return (
      <div className="sb-bars">
        {b.bars.map((bar, i) => (
          <span key={i} className="sb-bar">
            {bar.map((t) => { const idx = k++; return <span key={idx} className={`sb-tok ${now?.block === bi && now.seg === idx ? 'now' : ''}`}>{t === '.' || t === '/' ? '·' : <button className="sb-chord" onClick={() => onChord(shown(t))}>{shown(t)}</button>}</span>; })}
          </span>
        ))}
      </div>
    );
  }
  // 탭: 원래 글자 그대로 + 지금 음 위치에 세로 막대
  const ev = now?.block === bi && now.event !== undefined ? b.events[now.event] : null;
  return (
    <div className="sb-tab">
      <pre>{b.lines.join('\n')}</pre>
      {ev && <span className="sb-tab-now" style={{ left: `${ev.col}ch` }} />}
      {meta.capo > 0 && <span className="muted small">카포 {meta.capo} 기준 프렛</span>}
    </div>
  );
}
