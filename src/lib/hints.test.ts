import { describe, expect, it } from 'vitest';
import { fallbackHint } from './hints.ts';

describe('built-in hints', () => {
  it('gives the same short hint for the same question and never names an answer', () => {
    const a = fallbackHint('math', 'math-5-001');
    expect(fallbackHint('math', 'math-5-001')).toBe(a);
    for (const subject of ['math', 'vocab', 'reading', 'science', 'unknown']) {
      const h = fallbackHint(subject, 'q' + subject);
      expect(h.length).toBeGreaterThan(10);
      expect(h).not.toMatch(/answer is|correct/i);
    }
  });
});
