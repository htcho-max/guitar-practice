import { useEffect, useState } from 'react';
import { setCustomPatterns, type Pattern } from '../finger/patterns';
import { setCustomStrums, type StrumPattern } from '../strum/patterns';
import { kvGet, kvSet } from '../data/db';

let fingers: Pattern[] = [];
let strums: StrumPattern[] = [];
let version = 0;
const listeners = new Set<(v: number) => void>();
const bump = () => { version++; listeners.forEach((f) => f(version)); };

export async function loadCustomPatterns() {
  fingers = await kvGet<Pattern[]>('my-finger-patterns', []);
  strums = await kvGet<StrumPattern[]>('my-strum-patterns', []);
  setCustomPatterns(fingers);
  setCustomStrums(strums);
  bump();
}
export async function saveFingerPattern(p: Pattern) {
  fingers = [...fingers.filter((x) => x.id !== p.id), { ...p, custom: true }];
  setCustomPatterns(fingers); await kvSet('my-finger-patterns', fingers); bump();
}
export async function deleteFingerPattern(id: string) {
  fingers = fingers.filter((x) => x.id !== id);
  setCustomPatterns(fingers); await kvSet('my-finger-patterns', fingers); bump();
}
export async function saveStrumPattern(p: StrumPattern) {
  strums = [...strums.filter((x) => x.id !== p.id), { ...p, custom: true }];
  setCustomStrums(strums); await kvSet('my-strum-patterns', strums); bump();
}
export async function deleteStrumPattern(id: string) {
  strums = strums.filter((x) => x.id !== id);
  setCustomStrums(strums); await kvSet('my-strum-patterns', strums); bump();
}
/** 내 패턴이 바뀌면 다시 그리기 */
export function useCustomVersion() {
  const [v, setV] = useState(version);
  useEffect(() => { listeners.add(setV); return () => { listeners.delete(setV); }; }, []);
  return v;
}
export const newPatternId = (prefix: string) => `${prefix}-${Date.now().toString(36)}`;
