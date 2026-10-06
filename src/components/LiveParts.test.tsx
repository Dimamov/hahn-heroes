import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { Bracket, MysteryPicture } from './LiveParts.tsx';
import type { ClassDuel } from '../lib/backend.ts';

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

describe('Bracket', () => {
  const side = (name: string, score: number) => ({ name, starter: 'ana', score });
  const duel: ClassDuel = {
    round: 2, rounds: 2, myStatus: 'dueling',
    matches: [
      { round: 1, slot: 1, me: true, a: side('Ana', 3), b: side('Ben', 1), winner: 'a', aAnswered: false, bAnswered: false, aRight: null, bRight: null },
      { round: 1, slot: 2, me: false, a: side('Cy', 2), b: null, winner: 'a', aAnswered: false, bAnswered: false, aRight: null, bRight: null },
      { round: 2, slot: 1, me: true, a: side('Ana', 0), b: side('Cy', 0), winner: null, aAnswered: true, bAnswered: false, aRight: null, bRight: null },
    ],
  };
  it('shows a column per round, the final, byes and who has answered', () => {
    const html = renderToStaticMarkup(<Bracket duel={duel} />);
    expect(html).toContain('Final');
    expect(html).toContain('Round 1');
    expect(html).toContain('free pass');
    expect(html).toContain('✋');
    expect(html.match(/bracket-side won/g)?.length).toBe(2);
  });
});
