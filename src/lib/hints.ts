// Built-in hints, used when the AI helper is off, out of tries for the day, or fails. They never give the answer.
const GENERIC: Record<string, string[]> = {
  math: ['Read the question slowly, then try it on scratch paper. Which choices are too big or too small?', 'Break the problem into small steps and do one step at a time.', 'Try drawing a quick picture of what the question is asking.', 'Estimate first. Cross out any choice that is far from your estimate.'],
  vocab: ['Look for a small word inside the big word. Have you seen it somewhere?', 'Use the word in a sentence in your head. Which choice sounds right?', 'Cross out the choices that clearly do not fit, then pick from the rest.', 'Think of where you have heard this word before.'],
  reading: ['Go back to the text and find the line that talks about this.', 'Look for the choice that the story actually says, not just something that sounds good.', 'Read the question again. What is it really asking for?', 'Cross out the choices the text does not mention.'],
  science: ['Think about what you have seen in real life that is like this.', 'Cross out the choices that cannot be true, then think about the rest.', 'Read each choice and ask: could this happen? Why or why not?', 'Remember the key words in the question. They are clues.'],
};
export function fallbackHint(subject: string, id: string): string {
  const list = GENERIC[subject] ?? GENERIC.math;
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}
export interface HintResult { hint: string; ai: boolean; left: number | null }
