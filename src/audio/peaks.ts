import { getAudioContext } from './context';

/** 소리 → 구간마다 최대 크기 (0~1) */
export function peaksOf(data: Float32Array, n = 160): number[] {
  const out: number[] = [];
  const step = Math.max(1, Math.floor(data.length / n));
  let max = 0;
  for (let i = 0; i < n; i++) {
    let m = 0;
    for (let j = i * step; j < Math.min(data.length, (i + 1) * step); j++) { const v = Math.abs(data[j]); if (v > m) m = v; }
    out.push(m); if (m > max) max = m;
  }
  return max > 0 ? out.map((v) => Math.round((v / max) * 1000) / 1000) : out;
}

export async function blobPeaks(blob: Blob, n = 160): Promise<number[] | null> {
  try {
    const buf = await getAudioContext().decodeAudioData(await blob.arrayBuffer());
    return peaksOf(buf.getChannelData(0), n);
  } catch { return null; }
}
