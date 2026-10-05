// Friendly battle arena: turn-based sparring against a training bot. Nobody can lose: if your hero
// runs out of health they catch a second wind and the fight goes on. No points, no penalty.
export type Move = 'strike' | 'power' | 'guard' | 'heal';
export const MOVES: { id: Move; label: string; icon: string; blurb: string }[] = [
  { id: 'strike', label: 'Strike', icon: '👊', blurb: 'A solid hit. Builds 1 energy.' },
  { id: 'power', label: 'Power', icon: '💥', blurb: 'A big hit. Costs 2 energy.' },
  { id: 'guard', label: 'Guard', icon: '🛡️', blurb: 'Take half damage. Builds 1 energy.' },
  { id: 'heal', label: 'Heal', icon: '💚', blurb: 'Get 8 health back. Twice per fight.' },
];
export interface Foe { id: string; name: string; icon: string; hp: number; strike: number; power: number; blurb: string }
export const FOES: Foe[] = [
  { id: 'spark', name: 'Spark Bot', icon: '🤖', hp: 24, strike: 3, power: 7, blurb: 'Gentle. Good for warming up.' },
  { id: 'knight', name: 'Nexus Knight', icon: '🤺', hp: 32, strike: 4, power: 9, blurb: 'Steady and clever.' },
  { id: 'echo', name: 'Shadow Echo', icon: '👻', hp: 40, strike: 5, power: 11, blurb: 'The toughest sparring partner.' },
];
export const HERO_HP = 36;
export const SECOND_WIND_HP = 18;
export const STRIKE = 6;
export const POWER = 12;
export const POWER_COST = 2;
export const HEAL = 8;
export const HEALS = 2;

export interface Fighter { hp: number; energy: number; heals: number }
export interface Battle { foe: Foe; hero: Fighter; bot: Fighter; turn: number; secondWinds: number; won: boolean; log: string[] }

export const startBattle = (foe: Foe): Battle => ({
  foe, hero: { hp: HERO_HP, energy: 0, heals: HEALS }, bot: { hp: foe.hp, energy: 0, heals: 1 }, turn: 1, secondWinds: 0, won: false, log: ['The sparring match begins!'],
});

export const canDo = (f: Fighter, m: Move, maxHp: number) => (m === 'power' ? f.energy >= POWER_COST : m === 'heal' ? f.heals > 0 && f.hp < maxHp : true);

/** Pick the bot's move. Mostly attacks, sometimes guards or heals when hurt. */
export const botMove = (b: Battle, rng: () => number): Move => {
  const r = rng();
  if (b.bot.heals > 0 && b.bot.hp < b.foe.hp * 0.4 && r < 0.5) return 'heal';
  if (b.bot.energy >= POWER_COST && r < 0.6) return 'power';
  return r < 0.8 ? 'strike' : 'guard';
};

const hit = (base: number, guarded: boolean) => Math.ceil(guarded ? base / 2 : base);
const pay = (f: Fighter, m: Move, maxHp: number): Fighter => {
  if (m === 'strike' || m === 'guard') return { ...f, energy: f.energy + 1 };
  if (m === 'power') return { ...f, energy: f.energy - POWER_COST };
  if (m === 'heal') return { ...f, hp: Math.min(maxHp, f.hp + HEAL), heals: f.heals - 1 };
  return f;
};

/** Play one turn: both sides choose, then the moves land together. A move you cannot do becomes a Strike. */
export function playTurn(b: Battle, mine: Move, theirs: Move): Battle {
  if (b.won) return b;
  const m = canDo(b.hero, mine, HERO_HP) ? mine : 'strike';
  const t = canDo(b.bot, theirs, b.foe.hp) ? theirs : 'strike';
  const toBot = m === 'strike' ? STRIKE : m === 'power' ? POWER : 0;
  const toHero = t === 'strike' ? b.foe.strike : t === 'power' ? b.foe.power : 0;
  let hero = pay(b.hero, m, HERO_HP);
  let bot = pay(b.bot, t, b.foe.hp);
  const dealt = hit(toBot, t === 'guard');
  const taken = hit(toHero, m === 'guard');
  bot = { ...bot, hp: Math.max(0, bot.hp - dealt) };
  hero = { ...hero, hp: Math.max(0, hero.hp - taken) };
  const log = [`You: ${m}${dealt ? ` (-${dealt})` : ''}. ${b.foe.name}: ${t}${taken ? ` (-${taken})` : ''}.`];
  let secondWinds = b.secondWinds;
  const won = bot.hp <= 0;
  if (!won && hero.hp <= 0) { hero = { ...hero, hp: SECOND_WIND_HP }; secondWinds += 1; log.push('Second wind! Your hero gets back up.'); }
  if (won) log.push(`You beat ${b.foe.name}!`);
  return { ...b, hero, bot, turn: b.turn + 1, secondWinds, won, log };
}

/** Three stars for a clean win, two with a second wind, one with more. */
export const arenaStars = (b: Battle) => (b.secondWinds === 0 ? 3 : b.secondWinds === 1 ? 2 : 1);
