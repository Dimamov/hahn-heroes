import { describe, expect, it } from 'vitest';
import { installKind } from './InstallPrompt.tsx';

const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';
const desktop = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36';

describe('installKind', () => {
  it('shows steps for phones and tablets', () => {
    expect(installKind({ ua: iphone, standalone: false, chromebook: false })).toBe('ios');
    expect(installKind({ ua: android, standalone: false, chromebook: false })).toBe('android');
    expect(installKind({ ua: desktop, standalone: false, chromebook: false, touchMac: true })).toBe('ios');
  });
  it('stays away when installed, on desktop and on school Chromebooks', () => {
    expect(installKind({ ua: iphone, standalone: true, chromebook: false })).toBeNull();
    expect(installKind({ ua: desktop, standalone: false, chromebook: false })).toBeNull();
    expect(installKind({ ua: android, standalone: false, chromebook: true })).toBeNull();
  });
});
