import { useEffect, useMemo, useRef, useState } from 'react';
import { db, type SongRow, type RecordingRow } from '../data/db';
import { addSong, saveSongText } from '../data/songs';
import { SAMPLE_SONGS, FORMAT_HELP } from '../song/samples';
import { parseSong, type Block, type ParsedSong } from '../song/parse';
import { buildTimeline, defaultStrum, type TimelineItem } from '../song/timeline';
import { buildPlan, slicePlan, blockRange, type PlanEvent, type Vis } from '../song/plan';
import { matchRun, type Expected, type Heard, type RunResult } from '../finger/score';
import { judgeChord, type ChordVerdict } from '../audio/chroma';
import { mic } from '../audio/mic';
import { recorder } from '../audio/recorder';
import { useMic } from '../state/useMic';
import { localDate } from '../data/dates';
import { Recordings } from '../components/Recordings';
import { TabEditor } from '../components/TabEditor';
import { PositionMap } from '../components/PositionMap';
import { addBarHits, easeBars, loadBarStats, weakBars } from '../data/weakbars';
import { resumeAudio } from '../audio/context';
import { PhotoPrompt } from '../components/PhotoPrompt';
import { recordReview } from '../data/review';
import { musicXmlToSong } from '../song/musicxml';
import { parseMelody } from '../fingerstyle/melody';
import { arrange, FS_STYLES, type FsStyle, type ChordSpan, type OctaveMode } from '../fingerstyle/arrange';
import { toSongText } from '../fingerstyle/ascii';
import { FsPlayer, OctavePicker } from './Fingerstyle';
import { parseChord, shapeForSymbol, transposeName } from '../guitar/symbols';
import { shapeMidis, type ChordShape } from '../guitar/chords';
import { tuningById, TUNINGS, suggestTunings } from '../guitar/tunings';

const NOTE_KEYS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
import { allPatterns } from '../finger/patterns';
import { ChordDiagram } from '../components/ChordDiagram';
import { Sequencer, type SeqEvent } from '../audio/sequencer';
import type { Sound } from '../song/plan';
import { synth } from '../audio/synth';
import { useSettings } from '../state/settings';
import { usePracticeTimer } from '../state/practice';
import { useWakeLock } from '../state/wakeLock';
import { setBusy } from '../state/busy';
import { useBackLayer } from '../state/back';
import { takeRequest, navigate } from '../state/navigate';
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
      try {
        if (/\.mxl$/i.test(f.name)) { bad.push(`${f.name} (압축된 .mxl — 악보 프로그램에서 "압축 안 한 MusicXML" 로 내보내 주세요)`); continue; }
        const text = await f.text();
        if (/\.(musicxml|xml)$/i.test(f.name) || /<score-partwise/.test(text.slice(0, 2000))) {
          const r = musicXmlToSong(text);
          await addSong(r.text, f.name.replace(/\.[^.]+$/, ''));
          if (r.warnings.length) bad.push(`${f.name}: ${r.warnings.join(', ')}`);
        } else await addSong(text, f.name.replace(/\.[^.]+$/, ''));
        n++;
      } catch (e) { bad.push(`${f.name}${e instanceof Error ? ` (${e.message})` : ''}`); }
    }
    setMsg(`곡 ${n}개를 불러왔어요.${bad.length ? ` 알림: ${bad.join(' / ')}` : ''}`);
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
    return <SongView key={open.id} initialRange={req?.songId === open.id ? req.range : undefined} initialBeats={req?.songId === open.id ? req.beats : undefined} song={open} onBack={() => { setOpenId(null); load(); }} onEdit={() => setEditing(open)} onChange={load} />;
  }
  const list = (songs ?? []).filter((s) => !q || (s.title + s.artist).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="page">
      <div className="row-setting">
        <button className="primary grow" onClick={() => setEditing('new')}>＋ 새 곡</button>
        <label className="button secondary grow">
          파일 불러오기
          <input type="file" accept=".txt,.cho,.chopro,.pro,.crd,.chordpro,.musicxml,.xml,.mxl,text/plain,application/vnd.recordare.musicxml+xml" multiple hidden onChange={(e) => { importFiles(e.target.files); e.target.value = ''; }} data-testid="song-file" />
        </label>
      </div>
      {msg && <p className="hint" role="status">{msg}</p>}
      {(songs?.length ?? 0) > 5 && <input className="text search" placeholder="곡 찾기" value={q} onChange={(e) => setQ(e.target.value)} />}
      {songs && songs.length === 0 && (
        <div className="card">
          <b>아직 곡이 없어요</b>
          <p className="hint">인터넷 코드 악보나 탭을 복사해서 ＋ 새 곡에 붙여 넣으면 돼요. 형식을 보려면 예시 곡을 넣어 보세요.</p>
          <button className="secondary" onClick={addSamples}>예시 곡 넣기 (아리랑 · Amazing Grace · 로망스 · 작은 별)</button>
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
      {songs && songs.length > 0 && SAMPLE_SONGS.some((x) => !songs.some((s) => s.title === x.title)) && <button className="link small muted" onClick={addSamples}>예시 곡 넣기</button>}
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
      <PhotoPrompt />
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

type SeqData = { vis?: Vis; check?: PlanEvent['check'] };
const player = new Sequencer<SeqData>();

function playSound(snd: Sound, w: number) {
  if (snd.kind === 'strum') synth.strum(snd.midis, w, snd.dir, snd.vel);
  else if (snd.kind === 'notes') snd.notes.forEach((n) => (n.harm ? synth.harm(n.midi, w, snd.vel, n.string) : synth.note(n.midi, w, snd.vel, n.string)));
  else if (snd.kind === 'chuck') synth.chuck(w);
  else if (snd.kind === 'slap') synth.slap(w);
  else synth.hit(w);
}

type Marks = Record<string, 'ok' | 'close' | 'wrong' | 'miss'>;
interface FollowResult { r: RunResult; chords: ChordVerdict[]; marks: Marks }

function SongView({ song, onBack, onEdit, onChange, initialRange, initialBeats }: { song: SongRow; onBack: () => void; onEdit: () => void; onChange: () => void; initialRange?: [number, number]; initialBeats?: [number, number] }) {
  const { settings } = useSettings();
  const parsed = useMemo(() => parseSong(song.text), [song.text]);
  const meta = parsed.meta;
  const tuning = tuningById(meta.tuning || settings.tuningId).midi;
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
  const [mode, setMode] = useState<'idle' | 'play' | 'follow'>('idle');
  const [count, setCount] = useState<number | null>(null);
  const [diagram, setDiagram] = useState<string | null>(null);
  // 구간: 고르는 중이면 블록을 눌러 시작·끝
  const [picking, setPicking] = useState(false);
  const [range, setRange] = useState<[number, number] | null>(initialRange ?? null);
  const [loop, setLoop] = useState(true);
  const [rec, setRec] = useState(false);
  const goalBpm = meta.tempo || song.bpm || 80;
  const barLabel = (a: number, b: number) => (b - a <= meta.beats ? `${a / meta.beats + 1}마디` : `${a / meta.beats + 1}~${b / meta.beats}마디`);
  // 약한 마디·이동 연습: 박 구간 집중 (느리게 → 원래 템포)
  const [focus, setFocus] = useState<{ beats: [number, number]; label: string } | null>(initialBeats ? { beats: initialBeats, label: `${barLabel(initialBeats[0], initialBeats[1])} 집중` } : null);
  const [ladder, setLadder] = useState(!!initialBeats);
  const [weak, setWeak] = useState<{ bar: number; rate: number }[]>([]);
  useEffect(() => { loadBarStats(song.id).then((s) => setWeak(weakBars(s))).catch(() => {}); }, [song.id]);
  const syncRef = useRef<{ recT: number; sync?: RecordingRow['sync'] } | null>(null);
  const overlaySrc = useRef<AudioBufferSourceNode | null>(null);
  const [recTick, setRecTick] = useState(0);
  const [result, setResult] = useState<FollowResult | null>(null);
  const [arranging, setArranging] = useState(false);
  const [editTab, setEditTab] = useState(false);
  const hasTab = parsed.blocks.some((b) => b.kind === 'tab');
  const saveTab = async (src: [number, number], rows: string[]) => {
    const lines = song.text.replace(/\r\n?/g, '\n').split('\n');
    lines.splice(src[0], src[1] - src[0], ...rows);
    await saveSongText(song.id, lines.join('\n'));
    onChange();
  };
  useBackLayer(arranging, () => setArranging(false));
  const melodyText = useMemo(() => parsed.blocks.filter((b): b is Block & { kind: 'melody' } => b.kind === 'melody').map((b) => b.text).join(' '), [parsed]);
  const { start: micStart, stop: micStop, error: micErr } = useMic({ reading: false });
  const bodyRef = useRef<HTMLDivElement>(null);
  const playing = mode !== 'idle';
  usePracticeTimer('song', playing);
  useWakeLock(playing, settings.wakeLock);
  useEffect(() => { setBusy('song', playing); return () => setBusy('song', false); }, [playing]);
  useEffect(() => () => { player.stop(); synth.stopAll(); recorder.stop(); }, []);
  useBackLayer(diagram !== null, () => setDiagram(null));
  useEffect(() => {
    const id = setTimeout(() => { db.songs.update(song.id, { capo, transpose, bpm, accomp }).catch(() => {}); }, 400);
    return () => clearTimeout(id);
  }, [capo, transpose, bpm, accomp, song.id]);
  useEffect(() => { try { localStorage.setItem('guitar-song-font', String(font)); } catch { /* 무시 */ } }, [font]);

  // 잡는 모양 = 적힌 코드 + 곡 카포 + 조 옮김 − 지금 카포
  const shift = meta.capo + transpose - capo;
  const shown = (name: string) => transposeName(name, shift);
  const shapeCache = useRef(new Map<string, ChordShape | null>());
  const shapeOf = (name: string): ChordShape | null => {
    if (!shapeCache.current.has(name)) { const c = parseChord(name); shapeCache.current.set(name, c ? shapeForSymbol(c, 0, tuning) : null); }
    return shapeCache.current.get(name)!;
  };
  const timeline = useMemo(() => buildTimeline(parsed), [parsed]);
  const chordsUsed = useMemo(() => [...new Set(timeline.items.filter((i): i is TimelineItem & { kind: 'chord' } => i.kind === 'chord').map((i) => shown(i.chord)))], [timeline, shift]); // eslint-disable-line react-hooks/exhaustive-deps
  const [from, to] = focus ? focus.beats : range ? blockRange(timeline, range[0], range[1]) : [0, timeline.beats];
  const chordItems = useMemo(() => timeline.items.filter((i): i is TimelineItem & { kind: 'chord' } => i.kind === 'chord'), [timeline]);
  const rootAt = (beat: number) => { const it = [...chordItems].reverse().find((c) => c.beat <= beat + 1e-6); const c = it ? parseChord(it.chord) : null; return c ? (c.root + meta.capo + transpose + 120) % 12 : null; };
  const backingOpts = (bass: boolean) => (settings.backing === 'click' ? {} : { backing: (bass && settings.backing === 'bass' ? 'bass' : 'drums') as 'bass' | 'drums', bassRoot: (b: number) => rootAt(b + from) });
  const tabEvents = useMemo(() => timeline.items.filter((i): i is TimelineItem & { kind: 'tab' } => i.kind === 'tab').map((i) => ({ beat: i.beat, notes: i.notes })), [timeline]);
  const startFocus = (a: number, b: number, label: string) => {
    stop(); setRange(null); setPicking(false); setEditTab(false);
    setFocus({ beats: [a, b], label }); setLoop(true); setLadder(true);
    setBpm(Math.max(40, Math.round(goalBpm * 0.6)));
    setTimeout(() => bodyRef.current?.querySelector('.in-range, .sb-wrap')?.scrollIntoView({ block: 'center' }), 50);
  };
  const rangeBars = Math.round((to - from) / meta.beats);

  useEffect(() => { if (playing) stop(); }, [capo, transpose, bpm, accomp, fingerId, strum, click, range?.join(), focus?.beats.join(), loop]); // eslint-disable-line react-hooks/exhaustive-deps

  function plan(): PlanEvent[] {
    const p = buildPlan(timeline, { beatsPerBar: meta.beats, tuning, capo, tabShift: meta.capo + transpose, accomp, strum, fingerId, shown, shapeOf });
    return slicePlan(p, from, to);
  }

  async function startRec() {
    if (!rec) return;
    if (!mic.running && !(await micStart())) return;
    if (mic.mediaStream) { recorder.start(mic.mediaStream); syncRef.current = { recT: (await resumeAudio()).currentTime }; }
  }
  /** 녹음 시작 → 0박 (스피커→마이크 지연 포함) */
  const markSync = (looping: boolean) => {
    const s = syncRef.current;
    if (s && recorder.recording) s.sync = { t0: player.t0 - s.recT + settings.roundTripMs / 1000, bpm, from, to: looping ? -(to - from) : to };
  };
  async function stopRec(label: string) {
    const r = await recorder.stop();
    if (r) {
      await db.recordings.add({ songId: song.id, label, date: localDate(), at: Date.now(), sec: r.sec, mime: r.blob.type, blob: r.blob, sync: syncRef.current?.sync }).catch(() => {});
      syncRef.current = null;
      setRecTick((t) => t + 1);
    }
  }
  const rangeLabel = focus ? focus.label : range ? `${rangeBars}마디 구간` : '전체';

  async function play() {
    const p = plan();
    if (!p.length) return;
    setResult(null);
    await synth.ready();
    await startRec();
    const events: SeqEvent<SeqData>[] = p.map((e) => ({ beat: e.beat, data: e.vis ? { vis: e.vis } : undefined, play: e.sound ? (_c, w) => playSound(e.sound!, w) : undefined }));
    const len = to - from;
    const looping = (!!range || !!focus) && loop;
    await player.start(events, {
      bpm, ...(looping ? { loopBeats: len } : { endBeats: len }), meterBeats: meta.beats, countIn: looping || range || focus ? meta.beats : 0, click, ...backingOpts(true),
      clickSound: settings.clickSound, clickVolume: settings.clickVolume,
      onEvent: (e) => { if (e.data?.vis) setNow(e.data.vis); },
      onBeat: (b) => setCount(b < 0 ? -b : null),
      onEnd: () => { setMode('idle'); setNow(null); setCount(null); if (recorder.recording) { stopRec(`재생 · ${rangeLabel}`); micStop(); } },
    });
    markSync(looping);
    setMode('play');
  }

  async function follow() {
    const p = plan();
    if (!p.length) return;
    setResult(null);
    if (!(await micStart())) return;
    if (rec && mic.mediaStream) { recorder.start(mic.mediaStream); syncRef.current = { recT: (await resumeAudio()).currentTime }; }
    const heard: Heard[] = [];
    const verdicts = new Map<string, ChordVerdict>();
    const off = mic.subscribeOnset((o) => heard.push({ time: o.time, chroma: o.chroma }));
    const events: SeqEvent<SeqData>[] = [];
    for (const e of p) {
      if (e.vis) events.push({ beat: e.beat, data: { vis: e.vis } });
      if (e.check) events.push({ beat: e.check.at, data: { check: e.check } });
    }
    const len = to - from;
    await player.start(events, {
      bpm, endBeats: len, meterBeats: meta.beats, countIn: meta.beats, click: true, ...backingOpts(false),
      clickSound: settings.clickSound, clickVolume: settings.clickVolume,
      onEvent: (e) => {
        if (e.data?.vis) setNow(e.data.vis);
        const ck = e.data?.check;
        if (ck) {
          // 0.25초 동안 세 번 들어서 평균
          const acc = new Array(12).fill(0);
          let n = 0;
          [0, 120, 240].forEach((ms, i) => setTimeout(() => {
            const c = mic.chroma();
            if (c) { c.forEach((v, k) => { acc[k] += v; }); n++; }
            if (i === 2 && n) verdicts.set(ck.key, judgeChord(acc.map((v) => v / n), ck.pcs, ck.bass));
          }, ms));
        }
      },
      onBeat: (b) => setCount(b < 0 ? -b : null),
      onEnd: () => setTimeout(async () => {
        off();
        await stopRec(`따라 치기 · ${rangeLabel}`);
        micStop();
        const exp: (Expected & { vis?: Vis })[] = [];
        let lastVis: Vis | undefined;
        for (const e of p) {
          if (e.vis) lastVis = e.vis;
          if (e.expect) exp.push({ time: player.timeOf(e.beat), pcs: e.expect.pcs, hit: e.expect.hit, slot: exp.length, lap: 0, vis: e.vis ?? lastVis, beat: e.beat } as Expected & { vis?: Vis; beat: number });
        }
        const first = exp[0]?.time ?? 0;
        const r = matchRun(exp, heard.filter((h) => h.time > first - 0.3), Math.max(0.12, 60 / bpm / 2));
        const marks: Marks = {};
        verdicts.forEach((v, k) => { marks[k] = v.verdict; });
        // 탭 음은 놓침·다른 음 표시
        r.steps.forEach((s) => {
          const v = (s.exp as Expected & { vis?: Vis }).vis;
          if (v?.event !== undefined) marks[`${v.block}:e${v.event}`] = !s.heard ? 'miss' : s.pitchOk === false ? 'wrong' : 'ok';
        });
        setResult({ r, chords: [...verdicts.values()], marks });
        const vs = [...verdicts.values()];
        const chordOk = vs.length ? vs.filter((v) => v.verdict === 'ok').length / vs.length : 1;
        // 마디별 기록 → 약한 마디
        const barOf = (b: number) => Math.floor((b + from) / meta.beats + 1e-6);
        const hits = r.steps.map((s) => ({ bar: barOf((s.exp as Expected & { beat: number }).beat), ok: !!s.heard && s.pitchOk !== false }));
        for (const e of p) if (e.check) { const v = verdicts.get(e.check.key); if (v) hits.push({ bar: barOf(e.check.at - 0.01), ok: v.verdict === 'ok' }); }
        const passed = r.hitRate >= 0.85 && chordOk >= 0.8;
        (focus && passed && bpm >= goalBpm
          ? easeBars(song.id, Array.from({ length: Math.round((to - from) / meta.beats) }, (_, k) => barOf(k * meta.beats)))
          : addBarHits(song.id, hits)).then((s) => setWeak(weakBars(s))).catch(() => {});
        if (ladder && r.hitRate >= 0.85 && chordOk >= 0.8) setBpm((b) => Math.min(goalBpm, Math.max(b + 1, Math.round(b * 1.05))));
        recordReview({ key: `song:${song.id}:${range ? range.join('-') : 'all'}`, kind: 'song', label: `${song.title} · ${rangeLabel}`, nav: { tab: 'song', songId: song.id, range: range ?? undefined }, note: `박 ${Math.round(r.hitRate * 100)}% · 코드 ${Math.round(chordOk * 100)}%` }, r.hitRate >= 0.85 && chordOk >= 0.8);
        setMode('idle'); setNow(null); setCount(null);
      }, 500),
    });
    setMode('follow');
  }

  async function overlay(r: RecordingRow) {
    const s = r.sync;
    if (!s) return;
    stop();
    const ctx = await synth.ready();
    let buf: AudioBuffer;
    try { buf = await ctx.decodeAudioData(await r.blob.arrayBuffer()); } catch { alert('이 녹음을 열 수 없어요'); return; }
    const looping = s.to < 0;
    const sFrom = s.from, sTo = looping ? s.from - s.to : s.to;
    const p = slicePlan(buildPlan(timeline, { beatsPerBar: meta.beats, tuning, capo, tabShift: meta.capo + transpose, accomp: accomp === 'none' ? 'strum' : accomp, strum, fingerId, shown, shapeOf }), sFrom, sTo);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const pan = ctx.createStereoPanner();
    pan.pan.value = -0.85;
    src.connect(pan).connect(ctx.destination);
    synth.setPan(0.85);
    const T = ctx.currentTime + 0.25;
    const skip = Math.max(0, -s.t0);
    src.start(T, skip);
    overlaySrc.current = src;
    src.onended = () => { if (overlaySrc.current === src) stop(); };
    const events: SeqEvent<SeqData>[] = p.map((e) => ({ beat: e.beat, data: e.vis ? { vis: e.vis } : undefined, play: e.sound ? (_c, w) => playSound(e.sound!, w) : undefined }));
    await player.start(events, {
      bpm: s.bpm, ...(looping ? { loopBeats: sTo - sFrom } : { endBeats: sTo - sFrom }), meterBeats: meta.beats, countIn: 0, click: false, startAt: T + Math.max(0, s.t0),
      onEvent: (e) => { if (e.data?.vis) setNow(e.data.vis); },
    });
    setMode('play');
  }

  function stop() {
    if (overlaySrc.current) { const o = overlaySrc.current; overlaySrc.current = null; try { o.stop(); } catch { /* 이미 멈춤 */ } }
    synth.setPan(0);
    player.stop(); synth.stopAll(); setMode('idle'); setNow(null); setCount(null);
    if (recorder.recording) stopRec(`${mode === 'follow' ? '따라 치기' : '재생'} · ${rangeLabel} (중간에 멈춤)`).then(() => micStop());
    else micStop();
  }

  useEffect(() => {
    if (!autoScroll || !now) return;
    bodyRef.current?.querySelector('.now')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [now, autoScroll]);

  const pickBlock = (bi: number) => {
    if (!picking) return;
    const b = parsed.blocks[bi];
    if (b.kind !== 'line' && b.kind !== 'bars' && b.kind !== 'tab') return;
    setFocus(null);
    if (!range || range[0] !== range[1]) setRange([bi, bi]);
    else { setRange([Math.min(range[0], bi), Math.max(range[0], bi)]); setPicking(false); }
  };

  const strumBad = accomp === 'strum' && /[^DUdux\-X]/.test(strum);
  const okChords = result ? result.chords.filter((c) => c.verdict === 'ok').length : 0;
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
      {(capo !== meta.capo || transpose !== 0) && <p className="hint">소리: {chordsUsed.slice(0, 6).map((c) => transposeName(c, capo)).join(' ')} {capo ? `· 카포 ${capo}프렛에서 위 모양으로` : ''}</p>}
      <div className="row-setting small">
        <span>반주</span>
        <select value={accomp} onChange={(e) => setAccomp(e.target.value as SongRow['accomp'])}>
          <option value="strum">긁기 패턴</option>
          <option value="finger">핑거 패턴</option>
          <option value="once">코드마다 한 번</option>
          <option value="none">소리 없이 (따라가기만)</option>
        </select>
        {accomp === 'strum' && <input className="text mono" value={strum} onChange={(e) => setStrum(e.target.value)} aria-label="긁기 패턴" style={{ maxWidth: 130 }} />}
        {accomp === 'finger' && <select value={fingerId} onChange={(e) => setFingerId(e.target.value)}>{allPatterns().map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>}
        <label title="설정에서 클릭·드럼·드럼+베이스를 고를 수 있어요"><input type="checkbox" checked={click} onChange={(e) => setClick(e.target.checked)} /> {settings.backing === 'click' ? '클릭' : settings.backing === 'drums' ? '드럼' : '드럼+베이스'}</label>
        <label><input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} /> 따라 내리기</label>
      </div>
      {strumBad && <p className="hint">긁기 패턴은 D(내려) U(올려) -(쉼) x(뮤트) 로 한 마디를 적어요.</p>}
      <div className="row-setting small range-row">
        <button className={`mini ${picking ? 'on' : ''}`} onClick={() => { setPicking(!picking); if (!picking) { setRange(null); setFocus(null); } }} data-testid="range-pick">{picking ? (range ? '끝 줄을 누르세요' : '시작 줄을 누르세요') : '구간 고르기'}</button>
        {focus && <><b className="focus-tag">{focus.label}</b><label><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> 반복</label><button className="mini" onClick={() => setFocus(null)}>전체로</button></>}
        {range && !picking && <><span>{rangeBars}마디 구간</span><label><input type="checkbox" checked={loop} onChange={(e) => setLoop(e.target.checked)} /> 반복</label><button className="mini" onClick={() => setRange(null)}>전체로</button></>}
        <label title="따라 치기를 통과할 때마다 템포 +5% (원래 템포까지)"><input type="checkbox" checked={ladder} onChange={(e) => { setLadder(e.target.checked); if (e.target.checked && bpm >= goalBpm) setBpm(Math.max(40, Math.round(goalBpm * 0.6))); }} /> 템포 사다리{ladder ? ` ${bpm}→${goalBpm}` : ''}</label>
        {hasTab && <button className={`mini ${editTab ? 'on' : ''}`} onClick={() => { stop(); setEditTab(!editTab); }} data-testid="tab-edit">{editTab ? '고치기 끝' : '✎ 탭 고치기'}</button>}
        <label className="rec-toggle"><input type="checkbox" checked={rec} onChange={(e) => setRec(e.target.checked)} disabled={playing} /> ● 녹음</label>
      </div>
      {meta.tuning && meta.tuning !== settings.tuningId && (
        <p className="hint" data-testid="song-tuning">이 곡은 <b>{tuningById(meta.tuning).name}</b> 조율이에요 (지금 설정: {tuningById(settings.tuningId).name}). <button className="link" onClick={() => { stop(); navigate({ tab: 'tuner', view: 'tuner', tuningId: meta.tuning }); }}>튜너에서 줄 맞추기 →</button></p>
      )}
      {weak.length > 0 && !editTab && (
        <div className="weak-row small" data-testid="weak-bars">
          <span>약한 마디</span>
          {weak.map((w) => <button key={w.bar} className="chip weak" onClick={() => startFocus(w.bar * meta.beats, Math.min(timeline.beats, (w.bar + 1) * meta.beats), `${w.bar + 1}마디 집중`)} title={`최근 놓친 비율 ${Math.round(w.rate * 100)}%`}>{w.bar + 1}마디 <small className="muted">{Math.round(w.rate * 100)}%</small></button>)}
          <span className="muted">누르면 그 마디만 60% 템포로 반복 → 통과마다 빨라져요</span>
        </div>
      )}
      {tabEvents.length > 0 && !editTab && <PositionMap events={tabEvents} beatsPerBar={meta.beats} bars={Math.round(timeline.beats / meta.beats)} onPractice={(a, b, label) => startFocus(a, b, label)} />}
      {melodyText ? (
        <button className="secondary" onClick={() => { stop(); setArranging(true); }} data-testid="arrange-open">🎸 핑거스타일로 편곡 (멜로디 + 베이스)</button>
      ) : chordsUsed.length > 0 && <p className="hint small">M| 줄로 멜로디를 적어 두면 코드와 합쳐 핑거스타일 탭을 만들어 줘요 (고치기 → 형식 도움말).</p>}
      {arranging && <ArrangeSheet song={song} melody={melodyText} timeline={timeline} beatsPerBar={meta.beats} tempo={meta.tempo || 80} onClose={() => setArranging(false)} />}
      {chordsUsed.length > 0 && (
        <div className="chips scroll-x">
          {chordsUsed.map((c) => <button key={c} className="chip" onClick={() => setDiagram(c)}>{c}</button>)}
        </div>
      )}
      {result && (
        <div className="result" data-testid="song-result">
          <b>따라 치기 결과 · {rangeLabel}</b>
          <div className="stats">
            <div><b>{Math.round(result.r.hitRate * 100)}%</b><span>박에 친 소리</span></div>
            <div><b>{result.chords.length ? `${okChords}/${result.chords.length}` : '—'}</b><span>맞게 울린 코드</span></div>
            <div><b>±{Math.round(result.r.sdMs)}ms</b><span>흔들림</span></div>
          </div>
          <span className="small">{Math.abs(result.r.meanMs) < 15 ? '박에 잘 맞아요.' : result.r.meanMs > 0 ? `평균 ${Math.round(result.r.meanMs)}ms 늦어요.` : `평균 ${Math.round(-result.r.meanMs)}ms 빨라요.`} 악보의 코드 색: 초록 맞음 · 노랑 거의 · 빨강 다름.</span>
          <button className="link small" onClick={() => setResult(null)}>색 지우기</button>
        </div>
      )}
      {micErr && <p className="error">{micErr}</p>}
      <div className={`song-body ${picking ? 'picking' : ''}`} ref={bodyRef} style={{ fontSize: font }}>
        {parsed.blocks.map((b, bi) => (
          <div key={bi} className={`sb-wrap ${(range && bi >= range[0] && bi <= range[1]) || (focus && (timeline.blockStart[bi] ?? -1) < focus.beats[1] && (timeline.blockStart[bi + 1] ?? timeline.beats) > focus.beats[0] && timeline.blockStart[bi] !== timeline.blockStart[bi + 1]) ? 'in-range' : ''}`} onClick={() => pickBlock(bi)}>
            {editTab && b.kind === 'tab' && b.src ? <TabEditor key={song.text.length + ':' + bi} block={b} beatsPerBar={meta.beats} onSave={(rows) => saveTab(b.src!, rows)} />
              : <SongBlock block={b} bi={bi} now={now} shown={shown} onChord={picking ? () => {} : setDiagram} meta={meta} marks={result?.marks} />}
          </div>
        ))}
      </div>
      <Recordings songId={song.id} tick={recTick} onOverlay={playing ? undefined : overlay} />
      {count !== null && <div className="count-float">{count}</div>}
      <div className="play-float">
        {playing ? (
          <button className="primary stop" onClick={stop}>■ 정지</button>
        ) : (
          <>
            <button className="primary" onClick={play} disabled={!timeline.items.length}>▶ 재생</button>
            <button className="secondary" onClick={follow} disabled={!timeline.items.length} data-testid="song-follow">🎤 따라 치기</button>
          </>
        )}
        <span className="muted small">{mode === 'follow' ? '클릭에 맞춰' : timeline.items.length ? `${rangeBars}마디${recorder.recording ? ' · ● 녹음' : ''}` : '재생할 코드·탭이 없어요'}</span>
      </div>
      {diagram && (
        <div className="sheet-backdrop" onClick={() => setDiagram(null)}>
          <div className="sheet" onClick={(e) => e.stopPropagation()}>
            {shapeOf(diagram) ? <ChordDiagram shape={shapeOf(diagram)!} labels={settings.chordLabels} width={220} tuning={tuning} /> : <p>{diagram}: 모양을 몰라요</p>}
            <div className="row-setting">
              {shapeOf(diagram) && <button className="secondary grow" onClick={async () => { const ctx = await synth.ready(); synth.strum(shapeMidis(shapeOf(diagram)!, tuning, capo), ctx.currentTime + 0.02); }}>▶ 긁기</button>}
              <button className="secondary grow" onClick={() => setDiagram(null)}>닫기</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SongBlock({ block: b, bi, now, shown, onChord, meta, marks }: { block: Block; bi: number; now: Vis | null; shown: (n: string) => string; onChord: (c: string) => void; meta: ParsedSong['meta']; marks?: Marks }) {
  if (b.kind === 'empty') return <div className="sb-empty" />;
  if (b.kind === 'section') return <div className="sb-section">{b.label}</div>;
  if (b.kind === 'melody') return <div className="sb-melody">{b.text}</div>;
  if (b.kind === 'comment') return <div className="sb-comment">{b.text}</div>;
  if (b.kind === 'line') {
    const hasChord = b.segs.some((s) => s.chord);
    return (
      <div className={`sb-line ${hasChord ? 'with-chords' : ''}`}>
        {b.segs.map((s, si) => (
          <span key={si} className={`sb-seg ${now?.block === bi && now.seg === si ? 'now' : ''} ${marks?.[`${bi}:${si}`] ?? ''}`}>
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
            {bar.map((t) => { const idx = k++; return <span key={idx} className={`sb-tok ${now?.block === bi && now.seg === idx ? 'now' : ''} ${marks?.[`${bi}:${idx}`] ?? ''}`}>{t === '.' || t === '/' ? '·' : <button className="sb-chord" onClick={() => onChord(shown(t))}>{shown(t)}</button>}</span>; })}
          </span>
        ))}
      </div>
    );
  }
  const ev = now?.block === bi && now.event !== undefined ? b.events[now.event] : null;
  return (
    <div className="sb-tab">
      <pre>{(b.rhythm ? [b.rhythm, ...b.lines] : b.lines).join('\n')}</pre>
      {ev && <span className="sb-tab-now" style={{ left: `${ev.col}ch`, top: b.rhythm ? '1.25em' : 0 }} />}
      {marks && b.events.map((e, ei) => marks[`${bi}:e${ei}`] && marks[`${bi}:e${ei}`] !== 'ok' ? <span key={ei} className={`sb-tab-mark ${marks[`${bi}:e${ei}`]}`} style={{ left: `${e.col}ch` }} /> : null)}
      {meta.capo > 0 && <span className="muted small">카포 {meta.capo} 기준 프렛</span>}
    </div>
  );
}

/** 내 곡 멜로디(M| 줄) + 코드 → 핑거스타일 탭 */
function ArrangeSheet({ song, melody, timeline, beatsPerBar, tempo, onClose }: { song: SongRow; melody: string; timeline: ReturnType<typeof buildTimeline>; beatsPerBar: number; tempo: number; onClose: () => void }) {
  const { settings } = useSettings();
  const [tuningId, setTuningId] = useState(settings.tuningId);
  const tuning = tuningById(tuningId).midi;
  const [style, setStyle] = useState<FsStyle>(settings.level === 4 ? 5 : 2);
  const [octave, setOctave] = useState<OctaveMode>('auto');
  const [bpm, setBpm] = useState(Math.max(50, Math.round(tempo * 0.75)));
  const [saved, setSaved] = useState<string | null>(null);
  const mel = useMemo(() => parseMelody(melody), [melody]);
  const spans: ChordSpan[] = useMemo(() => timeline.items.filter((i): i is TimelineItem & { kind: 'chord' } => i.kind === 'chord').map((i) => ({ beat: i.beat, dur: i.dur, name: i.chord })), [timeline]);
  const arr = useMemo(() => arrange(mel.notes, spans, beatsPerBar, style, { octave, tuning }), [mel, spans, beatsPerBar, style, octave, tuning]);
  const tonic = useMemo(() => { const last = spans.at(-1); const c = last ? parseChord(last.name) : null; return c ? c.root : null; }, [spans]);
  const sugg = tonic === null ? [] : suggestTunings(tonic);
  const melBeats = mel.beats, chordBeats = spans.reduce((t, c) => Math.max(t, c.beat + c.dur), 0);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet editor" onClick={(e) => e.stopPropagation()} role="dialog" aria-label="핑거스타일 편곡">
        <div className="card-head"><b>핑거스타일 편곡 · {song.title}</b><button className="mini" onClick={onClose}>닫기</button></div>
        <div className="chips">{FS_STYLES.map((s) => <button key={s.id} className={s.id === style ? 'chip on' : 'chip'} onClick={() => setStyle(s.id)}>{s.name}</button>)}</div>
        <OctavePicker value={octave} onChange={setOctave} />
        <div className="row-setting small">
          <span>조율</span>
          <select value={tuningId} onChange={(e) => setTuningId(e.target.value)} aria-label="편곡 조율">{TUNINGS.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        </div>
        {sugg.length > 0 && (
          <div className="chips small" data-testid="tuning-sugg">
            <span className="muted small">이 곡({NOTE_KEYS[tonic!]})에 어울리는 조율:</span>
            {sugg.map((t) => <button key={t.id} className={t.id === tuningId ? 'chip on' : 'chip'} title={t.why} onClick={() => setTuningId(t.id)}>{tuningById(t.id).name.split(' (')[0]}</button>)}
          </div>
        )}
        {tuningId !== 'std' && <p className="hint small">{sugg.find((t) => t.id === tuningId)?.why ?? ''} 저장한 탭에 조율이 적혀서, 곡을 열면 튜너로 바로 맞출 수 있어요.</p>}
        {mel.errors.length > 0 && <p className="error">멜로디에서 못 읽은 글자: {mel.errors.slice(0, 5).join(' ')}</p>}
        {Math.abs(melBeats - chordBeats) > 0.01 && <p className="hint">멜로디 {melBeats}박, 코드 {chordBeats}박 — 길이가 달라요. 마디 줄과 M| 줄 길이를 맞춰 주세요.</p>}
        {arr.warnings.length > 0 && <p className="hint">{arr.warnings.slice(0, 3).join(' · ')}</p>}
        <FsPlayer arr={arr} bpm={bpm} setBpm={(b) => setBpm(clampBpm(b))} target={tempo} />
        <button className="primary" data-testid="arrange-save" onClick={async () => {
          const st = FS_STYLES.find((x) => x.id === style)!;
          await addSong(toSongText(arr, { title: `${song.title} (핑거스타일 ${style}단계${octave === 'high' ? ' · 하이' : ''}${tuningId !== 'std' ? ' · ' + tuningById(tuningId).name.split(' (')[0] : ''})`, artist: song.artist, tempo, note: st.name }));
          setSaved('새 곡으로 저장했어요. 목록에서 열 수 있어요.');
        }}>탭을 새 곡으로 저장</button>
        {saved && <p className="hint" role="status">{saved}</p>}
      </div>
    </div>
  );
}
