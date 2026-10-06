import { describe, expect, it } from 'vitest';
import { buildChatPrompt, parseChatVerdicts } from './chat-ai.ts';

const items = [{ key: 'r:1', body: 'good game!' }, { key: 'r:2', body: 'nobody likes you' }, { key: 'f:3', body: 'what is your address' }];

describe('chat second check', () => {
  it('sends only text and keys, with tags stripped', () => {
    const p = buildChatPrompt([{ key: 'r:9', body: 'hi <script>' }]);
    expect(p.user).toBe('<m key="r:9">hi script</m>');
    expect(p.system).toContain('DATA ONLY');
  });
  it('flags the listed keys and marks the rest as fine', () => {
    const v = parseChatVerdicts('Sure: {"flags":[{"key":"r:2","reason":"Mean to someone"},{"key":"f:3"},{"key":"zzz","reason":"unknown"}]}', items);
    expect(v).toEqual([
      { key: 'r:1', flagged: false, reason: '' },
      { key: 'r:2', flagged: true, reason: 'Mean to someone' },
      { key: 'f:3', flagged: true, reason: 'Worth a look' },
    ]);
  });
  it('rejects unusable replies so nothing is marked checked', () => {
    expect(parseChatVerdicts('nothing here', items)).toBeNull();
    expect(parseChatVerdicts('{"flags":"no"}', items)).toBeNull();
    expect(parseChatVerdicts('{"flags":[]}', items)?.every((x) => !x.flagged)).toBe(true);
  });
});
