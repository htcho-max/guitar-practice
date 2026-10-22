/** 다른 탭으로 가면서 무엇을 열지 (오늘 탭 → 전환 쌍, 패턴, 곡) */
export type TabId = 'today' | 'chord' | 'finger' | 'song' | 'tuner';
export type NavRequest =
  | { tab: 'chord'; mode: 'dict' | 'change' | 'strum'; chord?: string; pair?: [string, string]; strumId?: string }
  | { tab: 'finger'; mode?: 'arp' | 'fs' | 'tech'; patternId?: string; chords?: string[]; tuneId?: string; style?: number }
  | { tab: 'song'; songId?: string; range?: [number, number]; /** 박 구간 (약한 마디 집중) */ beats?: [number, number] }
  | { tab: 'tuner'; view?: 'tuner' | 'metronome' | 'fretboard'; sub?: 'names' | 'scales'; tuningId?: string }
  | { tab: 'today' };

let pending: NavRequest | null = null;
const listeners = new Set<(r: NavRequest) => void>();
export function navigate(r: NavRequest) { pending = r; listeners.forEach((f) => f(r)); }
export function onNavigate(fn: (r: NavRequest) => void) { listeners.add(fn); return () => { listeners.delete(fn); }; }
/** 화면이 열릴 때 자기 몫의 요청을 가져감 */
export function takeRequest<T extends NavRequest['tab']>(tab: T): Extract<NavRequest, { tab: T }> | null {
  if (pending && pending.tab === tab) { const r = pending; pending = null; return r as Extract<NavRequest, { tab: T }>; }
  return null;
}
