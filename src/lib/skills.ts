// Skill trees and Nexus Surge rules. Keep in step with skills, surge_rules() and answer_question() in the database.
export interface SkillDef { id: string; tree: 'scholar' | 'explorer' | 'guardian'; tier: 1 | 2 | 3; name: string; icon: string; cost: number; blurb: string }
export const SKILLS: SkillDef[] = [
  { id: 'sc1', tree: 'scholar', tier: 1, name: 'Quick Study', icon: '📘', cost: 2, blurb: 'Nexus Surge starts after 4 right answers in a row instead of 5.' },
  { id: 'sc2', tree: 'scholar', tier: 2, name: 'Deep Focus', icon: '🔍', cost: 4, blurb: 'Nexus Surge lasts 15 minutes instead of 10.' },
  { id: 'sc3', tree: 'scholar', tier: 3, name: 'Brain Blaze', icon: '🧠', cost: 6, blurb: 'Nexus Surge pays double instead of one and a half times.' },
  { id: 'ex1', tree: 'explorer', tier: 1, name: 'Early Bird', icon: '🌅', cost: 2, blurb: '3 extra points on the daily check-in.' },
  { id: 'ex2', tree: 'explorer', tier: 2, name: 'Treasure Sense', icon: '🧭', cost: 4, blurb: '1 extra point for every right Learn answer.' },
  { id: 'ex3', tree: 'explorer', tier: 3, name: 'Lucky Day', icon: '🍀', cost: 6, blurb: '5 more extra points on the daily check-in.' },
  { id: 'gd1', tree: 'guardian', tier: 1, name: 'Team Spirit', icon: '🤝', cost: 2, blurb: 'Your Nexling grows 10% faster.' },
  { id: 'gd2', tree: 'guardian', tier: 2, name: 'Nexus Bond', icon: '💞', cost: 4, blurb: "Your Nexling's favourite play grows it 2 times instead of 1.5 times." },
  { id: 'gd3', tree: 'guardian', tier: 3, name: 'Guardian Aura', icon: '🛡️', cost: 6, blurb: 'Your Nexling grows 25% faster instead of 10%.' },
];
export const TREES = [
  { id: 'scholar', label: 'Scholar', icon: '📘', about: 'Powers up Nexus Surge' },
  { id: 'explorer', label: 'Explorer', icon: '🧭', about: 'Earns extra points' },
  { id: 'guardian', label: 'Guardian', icon: '🛡️', about: 'Grows your Nexling' },
] as const;
export const surgeRules = (has: (id: string) => boolean) => ({
  need: has('sc1') ? 4 : 5,
  minutes: has('sc2') ? 15 : 10,
  mult: has('sc3') ? 2 : 1.5,
});
export const dailyBonus = (has: (id: string) => boolean) => (has('ex1') ? 3 : 0) + (has('ex3') ? 5 : 0);
export const growthMultipliers = (has: (id: string) => boolean) => ({ bonus: has('gd2') ? 2 : 1.5, all: has('gd3') ? 1.25 : has('gd1') ? 1.1 : 1 });
