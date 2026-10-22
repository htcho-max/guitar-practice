export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
/** 코드 이름용: 흔히 쓰는 표기 (C# · Eb · F# · Ab · Bb) */
export const PC_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export const NOTE_NAMES_KO: Record<string, string> = {
  C: '도', 'C#': '도#', D: '레', 'D#': '레#', E: '미', F: '파', 'F#': '파#', G: '솔', 'G#': '솔#', A: '라', 'A#': '라#', B: '시',
};

export const pc = (midi: number) => ((Math.round(midi) % 12) + 12) % 12;

export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * Math.pow(2, (midi - 69) / 12);
}
export function freqToMidiFloat(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}
export function centsBetween(freq: number, ref: number): number {
  return 1200 * Math.log2(freq / ref);
}

export interface NoteInfo { midi: number; name: string; octave: number; cents: number }
export function freqToNote(freq: number, a4 = 440): NoteInfo {
  const m = freqToMidiFloat(freq, a4);
  const midi = Math.round(m);
  return { midi, name: NOTE_NAMES[pc(midi)], octave: Math.floor(midi / 12) - 1, cents: (m - midi) * 100 };
}
export function midiName(midi: number): string {
  return `${NOTE_NAMES[pc(midi)]}${Math.floor(midi / 12) - 1}`;
}
