import { describe, expect, it } from 'vitest';
import { buildHintPrompt, cleanHint } from './hint-ai.ts';

const choices = ['12', '15', '18'];
describe('AI hint checks', () => {
  it('accepts a short nudge', () => {
    expect(cleanHint('  "Try splitting the number into tens and ones first."  ', choices)).toBe('Try splitting the number into tens and ones first.');
  });
  it('rejects hints that give the answer away', () => {
    expect(cleanHint('The correct answer is the middle one.', choices)).toBeNull();
    expect(cleanHint('You should pick option B for this.', choices)).toBeNull();
    expect(cleanHint('Think about it, the answer is (b) for sure.', choices)).toBeNull();
    expect(cleanHint('It is probably 15 because that is nearest.', choices)).toBeNull();
  });
  it('rejects empty or very long replies', () => {
    expect(cleanHint('Hmm', choices)).toBeNull();
    expect(cleanHint('x'.repeat(300), choices)).toBeNull();
  });
  it('sends only the question and choices', () => {
    const p = buildHintPrompt('What is 5 x 3?', choices);
    expect(p.user).toContain('What is 5 x 3?');
    expect(p.system).toContain('Never say or imply which choice is correct');
  });
});
