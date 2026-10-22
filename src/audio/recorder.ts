/** 마이크 녹음 (MediaRecorder). 기기가 지원하는 형식으로 */
class Recorder {
  private mr: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private started = 0;
  get recording() { return this.mr !== null; }

  start(stream: MediaStream) {
    if (this.mr) return;
    const types = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm'];
    const mime = types.find((t) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t));
    this.mr = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 64000 } : undefined);
    this.chunks = [];
    this.mr.ondataavailable = (e) => { if (e.data.size) this.chunks.push(e.data); };
    this.mr.start(1000);
    this.started = performance.now();
  }

  stop(): Promise<{ blob: Blob; sec: number } | null> {
    const mr = this.mr;
    if (!mr) return Promise.resolve(null);
    this.mr = null;
    return new Promise((res) => {
      mr.onstop = () => {
        const blob = new Blob(this.chunks, { type: mr.mimeType || 'audio/webm' });
        res(blob.size ? { blob, sec: (performance.now() - this.started) / 1000 } : null);
      };
      try { mr.stop(); } catch { res(null); }
    });
  }
}
export const recorder = new Recorder();
