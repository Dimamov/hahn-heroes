import { useEffect, useState } from 'react';
import { canSpeak, speak, stopSpeaking } from '../lib/speak.ts';

/** A small speaker button that reads the given text aloud. Tap again to stop. Hidden if the device cannot speak. */
export function ReadAloud({ text }: { text: string }) {
  const [on, setOn] = useState(false);
  // New text means a new question: stop reading the old one.
  useEffect(() => { setOn(false); stopSpeaking(); return () => stopSpeaking(); }, [text]);
  if (!canSpeak()) return null;
  return (
    <button className="read-aloud" aria-label={on ? 'Stop reading' : 'Read this aloud'} aria-pressed={on}
      onClick={() => { if (on) { stopSpeaking(); setOn(false); } else { setOn(true); speak(text, () => setOn(false)); } }}>
      {on ? '⏹️' : '🔊'}
    </button>
  );
}
