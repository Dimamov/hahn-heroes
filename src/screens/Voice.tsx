import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { PagedList } from '../components/PagedList.tsx';
import { DEFAULT_RATE, canSpeak, englishVoices, loadPrefs, savePrefs, speak, stopSpeaking } from '../lib/speak.ts';

/** Pick the read-aloud voice and how fast it talks. Stays on this device. */
export function Voice() {
  const { go } = useSession();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(englishVoices);
  const [prefs, setPrefs] = useState(loadPrefs);
  useEffect(() => {
    if (!canSpeak()) return;
    const load = () => setVoices(englishVoices());
    window.speechSynthesis.addEventListener('voiceschanged', load);
    return () => { window.speechSynthesis.removeEventListener('voiceschanged', load); stopSpeaking(); };
  }, []);
  const set = (p: typeof prefs) => { setPrefs(p); savePrefs(p); };
  const chosen = prefs.name ?? voices[0]?.name;
  return (
    <main className="screen">
      <ScreenBar title="Read-aloud voice" onBack={() => go('profile')} />
      {!canSpeak() ? <p className="hint">This device can't read aloud.</p> : (
        <>
          <div className="seg" role="group" aria-label="Speed">
            {([['Slow', 0.7], ['Normal', DEFAULT_RATE], ['Fast', 1.05]] as const).map(([label, r]) => <button key={label} className={Math.abs(prefs.rate - r) < 0.01 ? 'chosen' : ''} onClick={() => set({ ...prefs, rate: r })}>{label}</button>)}
          </div>
          <PagedList items={voices} perPage={4} empty="No voices found on this device." render={(v) => (
            <button key={v.name} className={`card clickable${chosen === v.name ? ' mine' : ''}`} onClick={() => { const p = { ...prefs, name: v.name }; set(p); speak('Hi! I can read your questions out loud.'); }}>
              <b>{chosen === v.name ? '✓ ' : ''}{v.name}</b><small>{v.lang}</small>
            </button>
          )} />
          <button className="btn ghost" onClick={() => speak('Hi! I can read your questions out loud.')}>🔊 Hear it</button>
        </>
      )}
    </main>
  );
}
