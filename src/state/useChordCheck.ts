import { useEffect, useRef, useState } from 'react';
import { mic } from '../audio/mic';
import { judgeChord, type ChordVerdict } from '../audio/chroma';
import { midiName } from '../audio/notes';

/** 긁을 때마다 코드 판정 (소리 시작 → 0.25초 뒤부터 0.3초 평균) */
export function useChordCheck(active: boolean, pcs: number[], bass?: number) {
  const [verdict, setVerdict] = useState<ChordVerdict | null>(null);
  const [listening, setListening] = useState(false);
  const key = pcs.join(',') + ':' + bass;
  const target = useRef({ pcs, bass });
  target.current = { pcs, bass };
  useEffect(() => { setVerdict(null); }, [key]);
  useEffect(() => {
    if (!active) return;
    let timers: ReturnType<typeof setTimeout>[] = [];
    const off = mic.subscribeOnset(() => {
      timers.forEach(clearTimeout);
      setListening(true);
      const acc = new Array(12).fill(0);
      let n = 0;
      timers = [250, 350, 450, 550].map((ms, i, arr) => setTimeout(() => {
        const c = mic.chroma();
        if (c) { c.forEach((v, k) => { acc[k] += v; }); n++; }
        if (i === arr.length - 1) {
          setListening(false);
          if (n) setVerdict(judgeChord(acc.map((v) => v / n), target.current.pcs, target.current.bass));
        }
      }, ms));
    });
    return () => { off(); timers.forEach(clearTimeout); };
  }, [active]);
  return { verdict, listening, reset: () => setVerdict(null) };
}

export type StringResult = { state: 'ok' | 'bad' | 'none'; heard?: string };

/** 한 줄씩: 낮은 줄부터 차례로 튕기면 줄마다 맞는 음인지 */
export function useStringCheck(active: boolean, midis: (number | null)[], a4: number) {
  const order = midis.map((m, i) => (m === null ? -1 : i)).filter((i) => i >= 0);
  const [pos, setPos] = useState(0);
  const [results, setResults] = useState<(StringResult | null)[]>(() => midis.map(() => null));
  const key = midis.join(',');
  const st = useRef({ armed: false, since: 0, stable: 0, last: 0, pos: 0 });
  useEffect(() => { setPos(0); setResults(midis.map(() => null)); st.current.pos = 0; }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!active) return;
    const s = st.current;
    const finish = (r: StringResult) => {
      const idx = order[s.pos];
      if (idx === undefined) return;
      setResults((prev) => { const n = prev.slice(); n[idx] = r; return n; });
      s.pos++;
      setPos(s.pos);
      s.armed = false;
    };
    const offOnset = mic.subscribeOnset((o) => { s.armed = true; s.since = o.time; s.stable = 0; });
    const offPitch = mic.subscribe((r) => {
      if (!s.armed || s.pos >= order.length) return;
      const want = midis[order[s.pos]]!;
      if (r.freq) {
        const m = 69 + 12 * Math.log2(r.freq / a4);
        if (Math.abs(m - s.last) < 0.4) s.stable++; else s.stable = 1;
        s.last = m;
        if (s.stable >= 4) {
          const ok = Math.abs(m - want) <= 0.5;
          finish(ok ? { state: 'ok' } : { state: 'bad', heard: midiName(Math.round(m)) });
        }
      } else if (r.time - s.since > 0.9) {
        finish({ state: 'none' });
      }
    });
    return () => { offOnset(); offPitch(); };
  }, [active, key, a4]); // eslint-disable-line react-hooks/exhaustive-deps
  const current = pos < order.length ? order[pos] : null;
  const reset = () => { st.current.pos = 0; st.current.armed = false; setPos(0); setResults(midis.map(() => null)); };
  return { results, current, done: pos >= order.length, reset };
}
