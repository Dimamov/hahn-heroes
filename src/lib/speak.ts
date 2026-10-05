/** Read-aloud with the phone's own voice. Nothing leaves the device. */
export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

export function speak(text: string, onEnd?: () => void): void {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.9;
  u.lang = 'en-US';
  const voice = synth.getVoices().find((v) => v.lang.startsWith('en'));
  if (voice) u.voice = voice;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
}

export function stopSpeaking(): void {
  if (canSpeak()) window.speechSynthesis.cancel();
}

/** What a question sounds like when read out: the question, then each choice with its letter. */
export function questionText(prompt: string, choices: string[], passage?: string | null): string {
  const letters = 'ABCD';
  return [passage, prompt, ...choices.map((c, i) => `${letters[i] ?? i + 1}. ${c}`)].filter(Boolean).join(' ');
}
