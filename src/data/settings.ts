import type { ClickSound } from '../audio/metronome';

export type Level = 1 | 2 | 3 | 4;
export const LEVEL_NAMES: Record<Level, string> = { 1: '입문', 2: '초급', 3: '중급', 4: '고급' };
/** 내용이 1~3단계까지만 있는 곳에서 쓰는 단계 */
export const lv3 = (l: Level | null | undefined): 1 | 2 | 3 => (Math.min(3, l ?? 1) as 1 | 2 | 3);

export interface Settings {
  /** 처음 고르기 전에는 null */
  level: Level | null;
  a4: number;
  tuningId: string;
  clickSound: ClickSound;
  clickVolume: number;
  synthVolume: number;
  wakeLock: boolean;
  /** 메트로놈 */
  bpm: number;
  meterId: string;
  subdivision: number;
  accent: boolean;
  /** 이어폰 지연 보정 (ms): 화면 표시를 늦춤 */
  latencyMs: number;
  /** 따라 치기: 스피커→마이크 왕복 지연 (ms) */
  roundTripMs: number;
  /** 코드 그림: 손가락 번호 / 도수 */
  chordLabels: 'finger' | 'degree' | 'note';
  /** 하루 목표 (분) */
  goalMin: number;
  minDb: number;
  /** 박 소리: 클릭 / 드럼 / 드럼+베이스 (곡·핑거스타일 재생) */
  backing: 'click' | 'drums' | 'bass';
}

export const DEFAULT_SETTINGS: Settings = {
  level: null,
  a4: 440,
  tuningId: 'std',
  clickSound: 'wood',
  clickVolume: 0.8,
  synthVolume: 0.9,
  wakeLock: true,
  bpm: 80,
  meterId: '4/4',
  subdivision: 1,
  accent: true,
  latencyMs: 0,
  roundTripMs: 80,
  chordLabels: 'finger',
  goalMin: 20,
  minDb: -55,
  backing: 'click',
};

export function mergeSettings(stored: Partial<Settings> | undefined): Settings {
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}
