import { describe, expect, it } from 'vitest';
import { buildPrompt, parseQuiz } from './lesson-ai.ts';

const good = (n = 3) => JSON.stringify({
  title: 'The Water Cycle',
  questions: Array.from({ length: n }, (_, i) => ({ prompt: `Question ${i}?`, choices: ['Rain', 'Snow', 'Fog'], answer: 1, explanation: 'Because.' })),
});

describe('lesson quiz checks', () => {
  it('accepts a well-formed quiz, even wrapped in other text', () => {
    expect(parseQuiz(good(), 3)?.questions).toHaveLength(3);
    expect(parseQuiz('Here you go:\n```json\n' + good(5) + '\n```', 5)?.title).toBe('The Water Cycle');
  });
  it('rejects broken or unsafe drafts', () => {
    expect(parseQuiz('no json here', 3)).toBeNull();
    expect(parseQuiz(good(2), 3)).toBeNull();
    expect(parseQuiz(good(6), 3)).toBeNull();
    const bad = (patch: object) => JSON.stringify({ title: 'T', questions: Array.from({ length: 3 }, () => ({ prompt: 'Q?', choices: ['a', 'b', 'c'], answer: 0, explanation: 'x', ...patch })) });
    expect(parseQuiz(bad({ answer: 3 }), 3)).toBeNull();
    expect(parseQuiz(bad({ choices: ['a', 'a', 'b'] }), 3)).toBeNull();
    expect(parseQuiz(bad({ choices: ['a'] }), 3)).toBeNull();
    expect(parseQuiz(bad({ prompt: 'x'.repeat(161) }), 3)).toBeNull();
    expect(parseQuiz(bad({ explanation: 'x'.repeat(201) }), 3)).toBeNull();
  });
  it('wraps the lesson as material and asks for the grade and count', () => {
    const p = buildPrompt('Plants need light.', 6, 4);
    expect(p.system).toContain('grade 6');
    expect(p.system).toContain('exactly 4 questions');
    expect(p.user).toBe('<lesson>\nPlants need light.\n</lesson>');
  });
});
