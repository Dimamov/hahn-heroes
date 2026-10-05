import { describe, expect, it } from 'vitest';
import { buildPayload, isDeadDevice, subjectFrom, validKeys, DEFAULT_SUBJECT } from './push.ts';

describe('push helpers', () => {
  it('builds a short payload that opens the app', () => {
    const p = JSON.parse(buildPayload({ kind: 'quiz_soon', title: 'T'.repeat(200), body: 'B'.repeat(300) }));
    expect(p.title.length).toBe(80);
    expect(p.body.length).toBe(140);
    expect(p).toMatchObject({ tag: 'quiz_soon', url: '/' });
  });
  it('drops devices that are gone, keeps others', () => {
    expect(isDeadDevice(410)).toBe(true);
    expect(isDeadDevice(404)).toBe(true);
    expect(isDeadDevice(500)).toBe(false);
    expect(isDeadDevice(undefined)).toBe(false);
  });
  it('checks the key format', () => {
    const pub = 'B'.repeat(87);
    const priv = 'a'.repeat(43);
    expect(validKeys(pub, priv)).toBe(true);
    expect(validKeys(undefined, priv)).toBe(false);
    expect(validKeys('short', priv)).toBe(false);
    expect(validKeys(pub, 'has space in it which is not a valid key at all really')).toBe(false);
  });
  it('uses the school address when the subject is missing or odd', () => {
    expect(subjectFrom(undefined)).toBe(DEFAULT_SUBJECT);
    expect(subjectFrom('javascript:1')).toBe(DEFAULT_SUBJECT);
    expect(subjectFrom('mailto:a@b.co')).toBe('mailto:a@b.co');
  });
});
