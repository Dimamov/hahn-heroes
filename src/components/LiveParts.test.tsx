import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MysteryPicture } from './LiveParts.tsx';

const open = (hp: number, max: number, code = 'ABCD') => (renderToStaticMarkup(<MysteryPicture code={code} boss={{ name: 'm', icon: 'x', hp, max }} />).match(/class="open"/g) ?? []).length;

describe('MysteryPicture', () => {
  it('uncovers tiles as the class gets answers right', () => {
    expect(open(10, 10)).toBe(0);
    expect(open(5, 10)).toBe(10);
    expect(open(0, 10)).toBe(20);
  });
  it('uncovers the same tiles on every screen for one code', () => {
    const tiles = (code: string) => renderToStaticMarkup(<MysteryPicture code={code} boss={{ name: 'm', icon: 'x', hp: 6, max: 10 }} />);
    expect(tiles('WXYZ')).toBe(tiles('WXYZ'));
  });
});
