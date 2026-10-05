// Boss raid bosses for demo mode (the server keeps the same list). One boss a week.
export const RAID_BOSSES = [
  { id: 'ember', name: 'Ember Phoenix', icon: '🔥', blurb: 'A fiery bird. Cool it down with cool heads.' },
  { id: 'frost', name: 'Frost Titan', icon: '🧊', blurb: 'A freezing giant. Heat it up with hot streaks!' },
  { id: 'glitch', name: 'The Glitch Dragon', icon: '🐲', blurb: 'It scrambles the Nexus numbers. Answer right to unscramble it!' },
  { id: 'shadow', name: 'Shadow Wisp', icon: '👻', blurb: 'It hides in the dark corners of the Nexus. Shine some light!' },
  { id: 'static', name: 'Static Golem', icon: '🗿', blurb: 'A rock giant made of noise. Quiet it with knowledge.' },
  { id: 'storm', name: 'Storm Kraken', icon: '🐙', blurb: 'It stirs up wild storms. Calm the waves together.' },
] as const;
export const RAID_RULES = { hpPerHero: 60, minHp: 400, coins: 30, xp: 10 } as const;
