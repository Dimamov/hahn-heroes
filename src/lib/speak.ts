/** Read-aloud with the phone's own voice. Nothing leaves the device. */
export const canSpeak = (): boolean => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined';

export interface VoiceInfo { name: string; lang: string; localService?: boolean }
const NICE = /natural|neural|enhanced|premium|siri|google|samantha|ava\b|allison|zoe|nicky|aaron|serena|karen|daniel|moira|tessa|aria|jenny|michelle|ana\b|guy\b|online/i;
const ROBOTIC = /compact|espeak|robot/i;
const NOVELTY = /fred|albert|zarvox|bad news|bahh|bells|boing|bubbles|cellos|deranged|good news|hysterical|junior|kathy|organ|pipe|ralph|trinoids|whisper|wobble|superstar|grandma|grandpa|eddy|flo|reed|rocko|sandy|shelley/i;

/** Higher is better: natural-sounding English voices first, novelty voices last. */
export function voiceScore(v: VoiceInfo): number {
  if (!/^en\b|^en[-_]/i.test(v.lang)) return -1;
  let n = 1;
  if (NICE.test(v.name)) n += 4;
  if (/enhanced|premium|neural|natural/i.test(v.name)) n += 3;
  if (/^en[-_]US/i.test(v.lang)) n += 2;
  if (/microsoft.*(natural|online)/i.test(v.name)) n += 3;
  if (ROBOTIC.test(v.name)) n -= 3;
  if (NOVELTY.test(v.name)) n -= 6;
  return n;
}
/** English voices, best first. */
export const rankVoices = <T extends VoiceInfo>(voices: T[]): T[] =>
  voices.filter((v) => voiceScore(v) >= 0).sort((a, b) => voiceScore(b) - voiceScore(a) || a.name.localeCompare(b.name));

export interface VoicePrefs { name: string | null; rate: number }
const KEY = 'hahn-heroes-voice';
export const DEFAULT_RATE = 0.8;
export function loadPrefs(): VoicePrefs {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return { name: typeof p.name === 'string' ? p.name : null, rate: typeof p.rate === 'number' ? Math.min(1.2, Math.max(0.6, p.rate)) : DEFAULT_RATE };
  } catch { return { name: null, rate: DEFAULT_RATE }; }
}
export function savePrefs(p: VoicePrefs): void { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* storage may be blocked */ } }

export const englishVoices = (): SpeechSynthesisVoice[] => (canSpeak() ? rankVoices(window.speechSynthesis.getVoices()) : []);

export function speak(text: string, onEnd?: () => void): void {
  if (!canSpeak()) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const prefs = loadPrefs();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = prefs.rate;
  u.lang = 'en-US';
  const voices = englishVoices();
  const voice = voices.find((v) => v.name === prefs.name) ?? voices[0];
  if (voice) { u.voice = voice; u.lang = voice.lang; }
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
