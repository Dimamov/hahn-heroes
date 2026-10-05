import { describe, expect, it } from 'vitest';
import { PUSH_KINDS, pushSupport, urlBase64ToUint8Array } from './push.ts';

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
const android = 'Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile';

describe('push support', () => {
  it('asks iPhone users to add the app to the home screen first', () => {
    expect(pushSupport({ ua: iphone, standalone: false, hasApis: false })).toBe('needs-install');
    expect(pushSupport({ ua: iphone, standalone: true, hasApis: true })).toBe('ok');
  });
  it('works in a normal browser that has the APIs', () => {
    expect(pushSupport({ ua: android, standalone: false, hasApis: true })).toBe('ok');
    expect(pushSupport({ ua: android, standalone: false, hasApis: false })).toBe('unsupported');
  });
  it('decodes URL-safe keys', () => {
    expect(Array.from(urlBase64ToUint8Array('AQID'))).toEqual([1, 2, 3]);
    expect(Array.from(urlBase64ToUint8Array('-_8'))).toEqual([251, 255]);
  });
  it('lists the right toggles for kids and parents', () => {
    expect(PUSH_KINDS.kid.map((k) => k.key)).toEqual(['chore_accepted', 'quiz_soon', 'sensei_message']);
    expect(PUSH_KINDS.parent.map((k) => k.key)).toEqual(['chore_waiting', 'weekly_summary', 'sensei_message']);
  });
});
