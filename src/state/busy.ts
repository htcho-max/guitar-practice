/** 재생 중인 것들 (업데이트 새로고침을 미룸) */
export const busyFlags = new Set<string>();
export function setBusy(name: string, on: boolean) { if (on) busyFlags.add(name); else busyFlags.delete(name); }
