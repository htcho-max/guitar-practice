import { useEffect, useState } from 'react';
import { metronome } from '../audio/metronome';

export function useMetronomeRunning() {
  const [on, setOn] = useState(metronome.running);
  useEffect(() => metronome.onState(setOn), []);
  return on;
}
