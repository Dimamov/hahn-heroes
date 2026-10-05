import { describe, expect, it } from 'vitest';
import { FOES, HERO_HP, POWER, SECOND_WIND_HP, STRIKE, arenaStars, botMove, canDo, playTurn, startBattle } from './arena.ts';

describe('friendly arena', () => {
  const foe = FOES[0];
  it('strike hits and builds energy; power needs energy and a move you cannot do becomes a strike', () => {
    let b = startBattle(foe);
    b = playTurn(b, 'power', 'guard');
    expect(b.hero.energy).toBe(1);
    expect(b.bot.hp).toBe(foe.hp - Math.ceil(STRIKE / 2));
    b = playTurn(b, 'strike', 'guard');
    expect(canDo(b.hero, 'power', HERO_HP)).toBe(true);
    const after = playTurn(b, 'power', 'guard');
    expect(after.hero.energy).toBe(0);
    expect(after.bot.hp).toBe(b.bot.hp - Math.ceil(POWER / 2));
  });
  it('guard halves damage and heal is limited and capped', () => {
    let b = startBattle(foe);
    b = playTurn(b, 'guard', 'strike');
    expect(b.hero.hp).toBe(HERO_HP - Math.ceil(foe.strike / 2));
    b = playTurn(b, 'heal', 'guard');
    expect(b.hero.hp).toBe(HERO_HP);
    expect(b.hero.heals).toBe(1);
  });
  it('nobody loses: at zero health the hero gets a second wind and the fight goes on', () => {
    let b = startBattle(FOES[2]);
    b = { ...b, hero: { ...b.hero, hp: 3 } };
    b = playTurn(b, 'strike', 'strike');
    expect(b.hero.hp).toBe(SECOND_WIND_HP);
    expect(b.secondWinds).toBe(1);
    expect(b.won).toBe(false);
    expect(arenaStars(b)).toBe(2);
  });
  it('wins when the bot runs out of health, with three stars for a clean win', () => {
    let b = startBattle(foe);
    b = { ...b, bot: { ...b.bot, hp: 5 } };
    b = playTurn(b, 'strike', 'strike');
    expect(b.won).toBe(true);
    expect(arenaStars(b)).toBe(3);
    expect(playTurn(b, 'strike', 'strike')).toBe(b);
  });
  it('the bot only picks moves it can do or falls back to a strike', () => {
    const b = startBattle(foe);
    for (const r of [0, 0.3, 0.55, 0.7, 0.95]) expect(['strike', 'power', 'guard', 'heal']).toContain(botMove(b, () => r));
  });
});
