import { chordPcs, type ChordShape, type Finger } from './chords';

/**
 * 어떤 조율에서도 쓸 수 있는 코드 자리 찾기 (변칙 조율용).
 * 위치(0~9프렛)마다 손 폭 4칸 안에서: 가장 낮은 음이 근음(또는 베이스), 코드 음 모두(5도는 빠져도 됨),
 * 4줄 이상, 손가락 4개 이하(같은 프렛 여러 줄은 바레 하나)
 */
const cache = new Map<string, ChordShape[]>();

export function findVoicings(root: number, suffix: string, tuning: number[], bass?: number, max = 4): ChordShape[] {
  const key = `${root}:${suffix}:${bass}:${tuning.join(',')}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const pcs = chordPcs(root, suffix);
  const want = bass ?? root;
  const fifth = (root + 7) % 12;
  const required = pcs.filter((p) => !(p === fifth && pcs.length >= 4) );
  const found: { frets: (number | null)[]; score: number; pos: number }[] = [];
  const seen = new Set<string>();
  for (let pos = 0; pos <= 9; pos++) {
    const lo = Math.max(1, pos), hi = pos + 3;
    const opts = tuning.map((open) => {
      const o: (number | null)[] = [null];
      if (pcs.includes(open % 12) || (bass !== undefined && open % 12 === bass)) o.push(0);
      for (let f = lo; f <= hi; f++) if (pcs.includes((open + f) % 12) || (bass !== undefined && (open + f) % 12 === bass)) o.push(f);
      return o;
    });
    const cur: (number | null)[] = [];
    const dfs = (s: number) => {
      if (s === tuning.length) {
        const sounded = cur.map((f, i) => (f === null ? -1 : i)).filter((i) => i >= 0);
        if (sounded.length < 4) return;
        const first = sounded[0];
        if ((tuning[first] + cur[first]!) % 12 !== want) return;
        // 첫 음 위로 막힌 줄은 하나까지
        const gaps = cur.slice(first).filter((f) => f === null).length;
        if (gaps > 1) return;
        const got = new Set(sounded.map((i) => (tuning[i] + cur[i]!) % 12));
        if (!required.every((p) => got.has(p))) return;
        const fretted = cur.filter((f): f is number => f !== null && f > 0);
        if (bass === undefined && [...got].some((p) => !pcs.includes(p))) return;
        const fingers = assignFingers(cur);
        if (!fingers) return;
        const k = cur.join(',');
        if (seen.has(k)) return;
        seen.add(k);
        const span = fretted.length ? Math.max(...fretted) - Math.min(...fretted) : 0;
        const opens = cur.filter((f) => f === 0).length;
        const score = sounded.length * 2 + opens * 1.5 - span - fretted.length * 0.5 - (fretted.length ? Math.min(...fretted) : 0) * 0.15 - gaps * 2;
        found.push({ frets: cur.slice(), score, pos: fretted.length ? Math.min(...fretted) : 0 });
        return;
      }
      for (const f of opts[s]) { cur.push(f); dfs(s + 1); cur.pop(); }
    };
    dfs(0);
  }
  // 위치마다 가장 좋은 것, 그 다음 점수 순
  found.sort((a, b) => b.score - a.score);
  const picked: typeof found = [];
  for (const v of found) {
    if (picked.some((p) => Math.abs(p.pos - v.pos) < 2)) continue;
    picked.push(v);
    if (picked.length >= max) break;
  }
  picked.sort((a, b) => a.pos - b.pos);
  const out = picked.map((v, i): ChordShape => {
    const fingers = assignFingers(v.frets)!;
    return { id: `v${i}-${key}`, root, suffix, bass, frets: v.frets, fingers: fingers.f, barre: fingers.barre, level: 3, form: 'open' };
  });
  cache.set(key, out);
  return out;
}

/** 손가락 정하기: 가장 낮은 프렛 여러 줄은 1번 바레, 나머지는 프렛·줄 순서로 2·3·4 */
export function assignFingers(frets: (number | null)[]): { f: Finger[]; barre?: ChordShape['barre'] } | null {
  const f: Finger[] = frets.map(() => 0);
  const fretted = frets.map((x, i) => ({ x, i })).filter((o): o is { x: number; i: number } => o.x !== null && o.x > 0);
  if (!fretted.length) return { f };
  const min = Math.min(...fretted.map((o) => o.x));
  const atMin = fretted.filter((o) => o.x === min);
  let barre: ChordShape['barre'];
  let next = 2;
  if (atMin.length >= 2) {
    // 바레 사이에 그보다 낮은 개방 줄이 끼면 안 됨
    const from = atMin[0].i, to = atMin[atMin.length - 1].i;
    if (frets.slice(from, to + 1).some((x) => x === 0)) return null;
    atMin.forEach((o) => { f[o.i] = 1; });
    barre = { fret: min, from, to };
  } else {
    f[atMin[0].i] = 1;
  }
  const rest = fretted.filter((o) => o.x !== min).sort((a, b) => a.x - b.x || a.i - b.i);
  for (const o of rest) {
    if (next > 4) return null;
    f[o.i] = next as Finger;
    next++;
  }
  return { f, barre };
}
