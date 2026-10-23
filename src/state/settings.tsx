import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { db } from '../data/db';
import { DEFAULT_SETTINGS, mergeSettings, type Settings } from '../data/settings';
import { setOutputLatency } from '../audio/latency';
import { synth } from '../audio/synth';
import { mic } from '../audio/mic';
import { metronome } from '../audio/metronome';

interface Ctx { settings: Settings; update: (patch: Partial<Settings>) => void; ready: boolean }
const SettingsContext = createContext<Ctx>({ settings: DEFAULT_SETTINGS, update: () => {}, ready: false });

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    db.kv.get('settings')
      .then((row) => setSettings(mergeSettings(row?.value as Partial<Settings> | undefined)))
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { db.kv.put({ key: 'settings', value: next }).catch(() => {}); }, 300);
      return next;
    });
  }, []);

  useEffect(() => { setOutputLatency(settings.latencyMs / 1000); }, [settings.latencyMs]);
  useEffect(() => { synth.a4 = settings.a4; mic.a4 = settings.a4; }, [settings.a4]);
  useEffect(() => { synth.setVolume(settings.synthVolume); }, [settings.synthVolume]);
  useEffect(() => { synth.setVoice(settings.guitarVoice); }, [settings.guitarVoice]);
  useEffect(() => { mic.inputLatency = settings.roundTripMs / 1000; }, [settings.roundTripMs]);
  useEffect(() => { mic.minDb = settings.minDb; }, [settings.minDb]);
  useEffect(() => { metronome.sound = settings.clickSound; metronome.volume = settings.clickVolume; }, [settings.clickSound, settings.clickVolume]);

  return <SettingsContext.Provider value={{ settings, update, ready }}>{children}</SettingsContext.Provider>;
}

export const useSettings = () => useContext(SettingsContext);
