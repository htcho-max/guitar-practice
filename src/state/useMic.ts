import { useCallback, useEffect, useState } from 'react';
import { mic, type PitchReading } from '../audio/mic';

export function micError(e: unknown): string {
  const name = (e as { name?: string }).name;
  if (name === 'NotAllowedError') return '마이크 권한이 거부됐어요. 브라우저 주소창의 권한 설정에서 마이크를 허용해 주세요.';
  if (!navigator.mediaDevices) return '이 브라우저에서는 마이크를 쓸 수 없어요 (https 주소인지 확인해 주세요).';
  return '마이크를 열 수 없어요. 다른 앱이 마이크를 쓰고 있는지 확인해 주세요.';
}

/** 화면에 있는 동안만 마이크를 씀. reading=false 면 음높이 구독 안 함 (코드 판정·따라 치기) */
export function useMic(opts: { reading?: boolean } = {}) {
  const wantReading = opts.reading !== false;
  const [reading, setReading] = useState<PitchReading | null>(null);
  const [on, setOn] = useState(mic.running);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => (wantReading ? mic.subscribe(setReading) : undefined), [wantReading]);
  useEffect(() => () => { mic.stop(); }, []);
  const start = useCallback(async () => {
    setError(null);
    try { await mic.start(); setOn(true); return true; } catch (e) { setError(micError(e)); return false; }
  }, []);
  const stop = useCallback(() => { mic.stop(); setOn(false); setReading(null); }, []);
  return { reading, on, error, start, stop };
}
