// Demo mode: the same rules as the server, saved only on this device. Lets the app run
// before a Supabase project is connected. Nothing here is secure; it is for trying the app.
import { HIDE, moveHide, newHideGame, searchHide, seekerOf, tickHide, type HideGame } from './hide.ts';
import { fallbackHint } from './hints.ts';
import { GOOFY, GOOFY_REWARD } from './goofy.ts';
import { isSpyEmoji } from './spy.ts';
import { KIND_REASONS, KIND_REWARD, KIND_WEEKLY_MAX } from './kindness.ts';
import { DRAWING_WORDS, isRightGuess, maskWord, scribble, type DrawStroke } from './drawing-rules.ts';
import { BOT_CLUES, isCaught, newRound, tallyVotes } from './shadow-rules.ts';
import { botMove, deal, move as odinMoveRule, type OdinGame } from './odin-rules.ts';
import {
  ARCADE_REWARDS, CLASS_PASS_PERCENT, DAILY_LOGIN_COINS, LEARNING_REWARDS, WEEKLY_CAPS, classMissionCoins, schoolDate, schoolWeek,
  type Currency, type RewardSource,
} from '../../supabase/functions/_shared/rewards.ts';
import {
  LOCKOUT_MINUTES, MAX_FAILED_TRIES, generateCode, generateHeroCode, heroDisplayName, isGrade, isStarterHero,
  isValidPicture, normalizeHeroCode,
} from '../../supabase/functions/_shared/kid-auth.ts';
import { SHOP_ITEMS, itemById } from './shop-catalog.ts';
import EVENTS_JSON from '../../content/events.json';
import { CARDS, cardById, fairness as tradeFairness, type OfferItem, type Rarity } from './cards.ts';
import { SKILLS, dailyBonus, growthMultipliers, surgeRules } from './skills.ts';
import { NEXLING_STAGES, nexlingType } from './nexlings.ts';
import bank from '../../content/questions.json';
import { RAID_BOSSES, RAID_RULES } from './raid.ts';
import { HEROES } from './heroes.ts';
import { AURAS, HAIR, MAKEUP } from './look.ts';
import { HUNTS, TREASURE_COIN, huntIndex } from './treasure.ts';
import { CODE_LIMITS, CODE_WORDS_A, CODE_WORDS_B } from './codes.ts';
import { CONTEST_POINTS, contestTheme } from './contest.ts';
import { COMIC_LINES, COMIC_MAX, COMIC_POSES, COMIC_SCENES, type ComicPanels } from './comics.ts';
import { STICKER_BGS, STICKER_COST, STICKER_DAILY, STICKER_DECOS, STICKER_FRAMES, STICKER_MAX, STICKER_WORDS } from './stickers.ts';
import { EMOTES, type EmoteId, type Pose } from './showcase.ts';
import {
  AdultAuthError, HOUSE_COLORS, SECRET_PLACES, SQUAD_WORDS, SUBJECTS, SignInError, emptyBalances,
  type Adult, type Announcement, type Backend, type ClassInfo, type ClassMission, type ClassMissionResults,
  type ClassResult, type Hero, type HouseIdentity, type HomeMission, type HomeMissionStatus, type Identity, type NewClassMission,
  type QuestState, type QuizQuestion, type RoomState, type SignUpInput, type Subject, type SubjectProgress, type TeacherCharacter, type TriviaState,
} from './backend.ts';

interface BankQuestion {
  id: string;
  subject: Subject;
  grade: 5 | 6;
  skill: string;
  difficulty: number;
  prompt: string;
  choices: string[];
  answer: number;
  explanation: string;
}
const QUESTIONS = bank as BankQuestion[];
type AnswerResultAwarded = { coins: number; xp: number; skillPoints: number; capped: boolean };
interface HistoryRow {
  childId: string;
  questionId: string;
  servedAt: number;
  answered?: boolean;
  correct?: boolean;
}

interface LedgerRow {
  heroId: string;
  currency: Currency;
  amount: number;
  source: RewardSource;
  key: string;
  week: string;
  day?: string;
}
interface Account extends Hero {
  picture: number[];
  failures: number[]; // timestamps (ms) of wrong tries since the last success
}
interface DemoAdult extends Adult {
  email: string;
  password: string;
}
interface HomeRow extends HomeMission {
  parentId: string;
}
interface ClassRow {
  id: string;
  teacherId: string;
  name: string;
  grade: 5 | 6;
  joinCode: string;
}
interface ClassMissionRow {
  id: string;
  classId: string;
  title: string;
  passage: string;
  questions: QuizQuestion[];
  maxCoins: number;
  answers: number[];
  explanations: string[];
}
interface SubmissionRow extends ClassResult {
  missionId: string;
  childId: string;
}
// A small version of the server's filter, for demo mode.
const BLOCK_ANYWHERE = ['shit', 'fuck', 'bitch', 'nigg', 'fagg', 'cunt', 'whore', 'slut', 'bastard', 'retard'];
const BLOCK_WHOLE = ['ass', 'asshole', 'damn', 'crap', 'dick', 'piss', 'fck', 'fuk', 'fag', 'kys', 'wtf', 'stfu', 'hoe', 'sex', 'porn', 'nude'];
export function chatFlagged(text: string): boolean {
  const map: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i' };
  const clean = [...text.toLowerCase()].map((c) => map[c] ?? c).join('').replace(/[^a-z ]/g, '');
  const squashed = clean.replace(/ /g, '');
  return BLOCK_ANYWHERE.some((w) => squashed.includes(w)) || BLOCK_WHOLE.some((w) => new RegExp(`(^| )${w}( |$)`).test(clean));
}

interface DemoShadow {
  category: string;
  word: string;
  options: string[];
  shadowId: string;
  order: string[];
  phase: 'clue' | 'vote' | 'guess' | 'done';
  turn: number;
  phaseStart: number;
  clues: { i: number; text: string }[];
  votes: Record<number, number>;
  caught: boolean | null;
  guess: string | null;
  shadowWon: boolean | null;
}
const SHADOW_SECONDS = { clue: 30, vote: 45, guess: 30 };
const SHADOW_BOT_MS = 3_000;

function demoShadowFinish(r: DemoRoom, sh: DemoShadow, shadowWon: boolean, now: number) {
  sh.phase = 'done'; sh.shadowWon = shadowWon; sh.phaseStart = now; r.state = 'done';
  for (const p of r.players) p.score += p.id === sh.shadowId ? (shadowWon ? 3 : 0) : shadowWon ? 0 : 2;
}

/** Runs the Shadow Signal clock: bots give clues, vote and guess; slow humans are skipped. */
function demoShadowTick(r: DemoRoom, now: number) {
  const sh = r.shadow;
  if (!sh) return;
  const bot = (id: string) => !!r.players.find((p) => p.id === id)?.bot;
  const shadowIdx = sh.order.indexOf(sh.shadowId);
  for (let guard = 0; guard < 60 && sh.phase !== 'done'; guard++) {
    if (sh.phase === 'clue') {
      if (sh.turn >= sh.order.length) { sh.phase = 'vote'; sh.phaseStart = now; continue; }
      const wait = bot(sh.order[sh.turn]) ? SHADOW_BOT_MS : SHADOW_SECONDS.clue * 1000;
      if (now < sh.phaseStart + wait) break;
      const at = sh.phaseStart + wait;
      sh.clues.push({ i: sh.turn, text: bot(sh.order[sh.turn]) ? BOT_CLUES[Math.floor(Math.random() * BOT_CLUES.length)] : '' });
      sh.turn += 1; sh.phaseStart = at;
    } else if (sh.phase === 'vote') {
      for (const [i, id] of sh.order.entries()) {
        if (!bot(id) || sh.votes[i] !== undefined || now < sh.phaseStart + SHADOW_BOT_MS + i * 700) continue;
        const others = sh.order.map((_, k) => k).filter((k) => k !== i);
        sh.votes[i] = i !== shadowIdx && Math.random() < 0.6 ? shadowIdx : others[Math.floor(Math.random() * others.length)];
      }
      if (Object.keys(sh.votes).length >= sh.order.length || now > sh.phaseStart + SHADOW_SECONDS.vote * 1000) {
        sh.caught = isCaught(sh.votes, shadowIdx);
        if (sh.caught) { sh.phase = 'guess'; sh.phaseStart = now; } else demoShadowFinish(r, sh, true, now);
      } else break;
    } else if (sh.phase === 'guess') {
      if (bot(sh.shadowId) && now >= sh.phaseStart + SHADOW_BOT_MS) {
        sh.guess = sh.options[Math.floor(Math.random() * sh.options.length)];
        demoShadowFinish(r, sh, sh.guess === sh.word, now);
      } else if (now > sh.phaseStart + SHADOW_SECONDS.guess * 1000) demoShadowFinish(r, sh, false, now);
      else break;
    }
  }
}

interface DemoDrawing {
  order: string[];
  round: number;
  word: string;
  used: string[];
  phase: 'draw' | 'reveal';
  phaseStart: number;
  strokes: DrawStroke[];
  solved: Record<string, number>;
  voided: boolean;
  guesses: { round: number; id: string; name: string; text: string; correct: boolean; at: number }[];
  plan: Record<string, number>;
  reports: string[];
  botSeed: number;
}
const DRAWING_SECONDS = 60;
const DRAWING_REVEAL = 6;

function drawingStartRound(r: DemoRoom, d: DemoDrawing, now: number) {
  d.phase = 'draw'; d.phaseStart = now; d.strokes = []; d.solved = {}; d.voided = false; d.reports = [];
  d.plan = {};
  d.botSeed = Math.floor(Math.random() * 10_000);
  for (const p of r.players.filter((x) => x.bot)) d.plan[p.id] = (6 + Math.random() * 40) * 1000;
}

/** Runs the Squad Drawing clock: bots draw and guess, rounds close, the next artist is up. */
function demoDrawingTick(r: DemoRoom, now: number) {
  const d = r.drawing;
  if (!d || r.state !== 'playing') return;
  for (let guard = 0; guard < 30 && r.state === 'playing'; guard++) {
    const artist = d.order[d.round];
    if (d.phase === 'draw') {
      const botArtist = r.players.find((p) => p.id === artist)?.bot;
      if (botArtist) {
        const plan = scribble(d.botSeed);
        d.strokes = plan.slice(0, Math.min(plan.length, Math.floor((now - d.phaseStart) / 2000) + 1));
      }
      for (const p of r.players.filter((x) => x.bot && x.id !== artist && d.solved[x.id] === undefined)) {
        if (now >= d.phaseStart + (d.plan[p.id] ?? Infinity)) {
          const points = 100 + Math.floor(50 * Math.max(0, 1 - (d.plan[p.id] ?? 0) / 1000 / DRAWING_SECONDS));
          d.solved[p.id] = points; p.score += points;
          d.guesses.push({ round: d.round, id: p.id, name: p.name, text: '', correct: true, at: now });
        }
      }
      const guessers = r.players.filter((p) => p.id !== artist).length;
      if (d.voided || Object.keys(d.solved).length >= guessers || now > d.phaseStart + DRAWING_SECONDS * 1000) {
        if (!d.voided) { const a = r.players.find((p) => p.id === artist); if (a) a.score += 50 * Object.keys(d.solved).length; }
        d.phase = 'reveal'; d.phaseStart = Math.min(now, d.phaseStart + DRAWING_SECONDS * 1000);
      } else break;
    } else if (now > d.phaseStart + DRAWING_REVEAL * 1000) {
      if (d.round + 1 >= d.order.length) { r.state = 'done'; break; }
      const pool = DRAWING_WORDS.filter((w) => !d.used.includes(w));
      d.round += 1; d.word = pool[Math.floor(Math.random() * pool.length)]; d.used.push(d.word);
      drawingStartRound(r, d, d.phaseStart + DRAWING_REVEAL * 1000);
    } else break;
  }
}

interface DemoSeal { qids: string[]; pos: number; solved: number; need: number; wrong: number; hidden: number[]; boostUsed: boolean; botNext?: number }
interface DemoNexus { startedAt: number; base: number; penalty: number; outcome: 'play' | 'won' | 'lost'; order: string[]; seals: Record<string, DemoSeal> }
const NEXUS = { seals: 3, spares: 3, base: 60, perPlayer: 50, wrong: 10, exhausted: 30 };

/** Runs the Escape the Nexus clock: buddies open a lock every so often and the squad wins or runs out of time. */
function demoNexusTick(r: DemoRoom, now: number) {
  const n = r.nexus;
  if (!n || n.outcome !== 'play' || r.state !== 'playing') return;
  for (const p of r.players.filter((x) => x.bot)) {
    const seal = n.seals[p.id];
    for (let guard = 0; guard < 10 && seal.solved < seal.need; guard++) {
      seal.botNext ??= n.startedAt + (8 + Math.random() * 10) * 1000;
      if (now < seal.botNext) break;
      if (Math.random() < 0.75) seal.solved += 1; else { seal.wrong += 1; n.penalty += NEXUS.wrong; }
      seal.botNext += (8 + Math.random() * 10) * 1000;
    }
  }
  if (r.players.every((p) => n.seals[p.id].solved >= n.seals[p.id].need)) { n.outcome = 'won'; r.state = 'done'; }
  else if (now > n.startedAt + (n.base + n.penalty) * 1000) { n.outcome = 'lost'; r.state = 'done'; }
}

const HOUSE_CAP = 80;
const EVENTS = EVENTS_JSON as { id: string; name: string; icon: string; blurb: string; starts: string; ends: string }[];
const DEMO_RIVALS = [
  { name: 'Ember Owls', color: '#f97316', power: 'flame', motto: 'Bright minds burn brighter', grade: 6, members: 22, week: 41.5, season: 188 },
  { name: 'Tide Titans', color: '#06b6d4', power: 'tide', motto: 'Steady waves win', grade: 5, members: 24, week: 33, season: 142.5 },
  { name: 'Frost Foxes', color: '#8b5cf6', power: 'frost', motto: 'Cool heads, quick feet', grade: 5, members: 21, week: 18, season: 96 },
];
const DEMO_PEERS = [
  { name: 'Nova', starter: 'b01', week: 70, season: 410, me: false },
  { name: 'Kai', starter: 'b02', week: 55, season: 275, me: false },
  { name: 'Mika', starter: 'b03', week: 40, season: 190, me: false },
];

interface DemoRoom {
  code: string;
  game: string;
  odin?: OdinGame;
  shadow?: DemoShadow;
  drawing?: DemoDrawing;
  nexus?: DemoNexus;
  hide?: HideGame;
  hostId: string;
  state: 'lobby' | 'playing' | 'done' | 'closed';
  phase: 'question' | 'reveal';
  idx: number;
  phaseStart: number;
  questions: { id: string; seconds: number }[];
  players: { id: string; name: string; starter: string; score: number; bot: boolean; answers: Record<number, { choice: number; points: number }>; botAt?: number; botRight?: boolean }[];
}
const ROOM_RULES = { max: 6, min: 2, questions: 8, seconds: 20, readingSeconds: 40, revealSeconds: 5 };

interface Db {
  accounts: Record<string, Account>; // heroes, by hero code
  adults: DemoAdult[];
  parentLinks: { childId: string; parentId: string }[];
  linkCodes: { childId: string; code: string; expiresAt: number; used: boolean }[];
  codeAttempts: { actor: string; kind: 'link' | 'class'; at: number }[];
  homeMissions: HomeRow[];
  classes: ClassRow[];
  members: { classId: string; childId: string }[];
  classMissions: ClassMissionRow[];
  submissions: SubmissionRow[];
  announcements: Announcement[];
  teacherCharacters?: Record<string, TeacherCharacter>;
  reads: { userId: string; announcementId: number }[];
  triviaNight: { weekday: string; time: string };
  trivia?: { date: string; heroId: string; going: boolean }[];
  looks?: { heroId: string; hair: string; makeup: string; aura: string; outfit: string | null; accessory: string | null; pinned: boolean; version: number; at: number }[];
  lookLikes?: { owner: string; liker: string; version: number }[];
  goofy?: { heroId: string; day: string; prompt: number; status: 'accepted' | 'done' | 'skipped' }[];
  kind?: { id: number; nominator: string; nominee: string; reason: string; day: string; at: number; status: 'pending' | 'approved' | 'skipped' }[];
  jam?: { squadId: string; heroId: string; seq: number; pads: number[]; at: number }[];
  squadBase?: { squadId: string; cell: number; item: string; by: string }[];
  treasure?: { week: string; heroId: string; step: number; claimed: boolean }[];
  codes?: { id: number; code: string; by: string; classId: string | null; coins: number; xp: number; day: string; expires: number; used: string[] }[];
  codeTries?: { heroId: string; at: number }[];
  contest?: { entries: { week: string; heroId: string }[]; votes: { week: string; voter: string; entry: string }[]; claims: { week: string; heroId: string }[] };
  comics?: { id: number; maker: string; panels: ComicPanels; shared: boolean; deleted?: boolean }[];
  stickers?: { id: number; maker: string; owner: string; hero: string; bg: string; frame: string; deco: string; word: string; day: string }[];
  secret?: { week: string; place: string; hint: string; card: string; finds: string[]; winner: { squadId: string; by: string } | null; claims: string[] };
  raid?: { week: string; boss: string; maxHp: number; strikes: { heroId: string; day: string; damage: number }[] };
  showcase?: { heroId: string; title: string; pose: Pose; emote?: string }[];
  eventEdits?: Record<string, { starts: string; ends: string; enabled: boolean }>;
  challenge?: { week: string; theme: string; goal: number; coins: number } | null;
  adv?: { heroId: string; caseId: string; solved: string[]; done: boolean }[];
  story?: { heroId: string; episode: string; panel: number; done: boolean; choices: Record<string, string>; solved: string[] }[];
  history: HistoryRow[];
  stats: { childId: string; subject: Subject; skill: string; attempts: number; correct: number }[];
  ledger: LedgerRow[];
  friendships?: { id: string; a: string; b: string; status: 'pending' | 'accepted' | 'declined' | 'removed' }[];
  squads?: { id: string; leader: string; name: string; disbanded: boolean; members: { childId: string; status: 'invited' | 'member' | 'declined' | 'left' }[] }[];
  nexlings?: { heroId: string; type: string; nickname: string; color: string; fromLedger: number }[];
  cardInv?: { heroId: string; cardId: string; qty: number }[];
  cardMeta?: { heroId: string; opened: number; showcase: string[] }[];
  trades?: { id: string; a: string; b: string; offerA: OfferItem[]; offerB: OfferItem[]; ver: number; confA: number; confB: number; status: 'open' | 'done' | 'cancelled' }[];
  learnedSkills?: { heroId: string; skillId: string }[];
  surge?: { heroId: string; streak: number; until: number }[];
  owned?: { heroId: string; itemId: string }[];
  equipped?: { heroId: string; slot: string; itemId: string | null }[];
  rooms?: { heroId: string; layout: { item: string; cell: number }[] }[];
  houses?: { classId: string; name: string; color: string; power: string; motto: string }[];
  houseOptions?: { classId: string; options: (HouseIdentity & { id: number })[]; open: boolean; votes: Record<string, number> }[];
  room?: DemoRoom | null;
  drawingReports?: { artist: string; reporter: string; word: string; at: string }[];
  friendChat?: { id: number; from: string; to: string; name: string; body: string; at: number }[];
  chat?: { messages: { id: number; childId: string; name: string; body: string; at: number }[]; status: Record<string, { strikes: number; banned: boolean; requested: boolean }> };
  hiddenGames?: string[];
  pings?: { userId: string; role: 'hero' | 'parent' | 'teacher' | 'sensei'; screen: string; at: number }[];
  current: string | null; // hero id or adult id
}

const KEY = 'hahn-heroes-demo-v3';
export const DEMO_SENSEI = { email: 'sensei@demo.test', password: 'sensei' };

const fresh = (): Db => ({
  accounts: {},
  adults: [{ id: 'demo-sensei', role: 'sensei', displayName: 'The Sensei', approved: true, ...DEMO_SENSEI }],
  parentLinks: [], linkCodes: [], codeAttempts: [], homeMissions: [], classes: [], members: [], classMissions: [],
  submissions: [], announcements: [], reads: [], triviaNight: { weekday: 'thursday', time: '18:30' },
  history: [], stats: [], ledger: [], current: null,
});

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const ODIN_TURN_MS = 45_000;
const ODIN_BOT_MS = 1_500;

/** Lets bots (and stalled humans) take their turns, one at a time, as if the clock had run continuously. */
function demoOdinTick(r: DemoRoom, now: number) {
  const g = r.odin;
  if (!g || r.state !== 'playing') return;
  const bots = new Set(r.players.filter((p) => p.bot).map((p) => p.id));
  const active = (id: string) => r.players.some((p) => p.id === id);
  for (let guard = 0; guard < 40 && !g.winner; guard++) {
    const id = g.order[g.turn];
    const wait = bots.has(id) ? ODIN_BOT_MS : ODIN_TURN_MS;
    if (now < g.turnStart + wait) break;
    const at = g.turnStart + wait;
    if (bots.has(id)) botMove(g, id, at, active); else odinMoveRule(g, id, null, null, at, active);
  }
  if (g.winner) r.state = 'done';
}

/** Moves a demo room along: practice buddies answer on their own, then the question closes and the next one opens. */
function demoRoomTick(r: DemoRoom, now = Date.now()) {
  if (r.game !== 'trivia-clash') return;
  for (let guard = 0; guard < 50 && r.state === 'playing'; guard++) {
    const rq = r.questions[r.idx];
    if (r.phase === 'question') {
      for (const p of r.players.filter((x) => x.bot && !x.answers[r.idx])) {
        p.botAt ??= r.phaseStart + (2 + Math.random() * 8) * 1000;
        p.botRight ??= Math.random() < 0.6;
        if (now >= p.botAt) {
          const q = QUESTIONS.find((x) => x.id === rq.id)!;
          const points = p.botRight ? 100 + Math.floor(50 * Math.max(0, 1 - (p.botAt - r.phaseStart) / 1000 / rq.seconds)) : 0;
          p.answers[r.idx] = { choice: p.botRight ? q.answer : (q.answer + 1) % q.choices.length, points };
          p.score += points;
        }
      }
      const everyone = r.players.every((p) => p.answers[r.idx]);
      if (everyone || now >= r.phaseStart + rq.seconds * 1000) { r.phase = 'reveal'; r.phaseStart = now; for (const p of r.players) { p.botAt = undefined; p.botRight = undefined; } } else break;
    } else if (now >= r.phaseStart + ROOM_RULES.revealSeconds * 1000) {
      if (r.idx + 1 >= r.questions.length) r.state = 'done';
      else { r.idx += 1; r.phase = 'question'; r.phaseStart = now; }
    } else break;
  }
}

export function createDemoBackend(storage: Pick<Storage, 'getItem' | 'setItem'>, now: () => Date = () => new Date()): Backend {
  const load = (): Db => {
    try {
      const raw = storage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Db;
        if (parsed.room) parsed.room.game ??= 'trivia-clash';
        for (const a of Object.values(parsed.accounts ?? {})) a.friendCode ??= generateCode(6);
        return parsed;
      }
    } catch { /* corrupted or blocked storage: start fresh */ }
    return fresh();
  };
  const save = (db: Db) => {
    try { storage.setItem(KEY, JSON.stringify(db)); } catch { /* private mode: keep going in memory only */ }
  };
  const db = load();
  const commit = () => save(db);
  const at = () => now().getTime();

  const strip = ({ picture: _p, failures: _f, ...hero }: Account): Hero => hero;
  const toAdult = ({ email: _e, password: _w, ...adult }: DemoAdult): Adult => adult;
  // Mirrors story_keys and story_choice_rewards. Answers live here only because demo mode is not secure.
  const STORY_KEYS: Record<string, { answer: number; choices: number; explanation: string }> = {
    'ep1:cp1': { answer: 1, choices: 3, explanation: '5 heroes times 12 crystals is 60 crystals.' },
    'ep1:cp2': { answer: 0, choices: 3, explanation: 'A keeper looks after something and keeps it safe.' },
    'ep1:cp3': { answer: 2, choices: 3, explanation: 'Reflection is light bouncing off a surface, like a mirror or a crystal.' },
  };
  const STORY_CHOICES: Record<string, { currency: Currency; amount: number }> = {
    'ep1:touch:ana': { currency: 'coins', amount: 5 },
    'ep1:touch:isabella': { currency: 'xp', amount: 5 },
    'ep1:touch:together': { currency: 'skill_points', amount: 1 },
  };
  // Mirrors adv_cases and adv_keys. Answers live here only because demo mode is not secure.
  const ADV: Record<string, { kind: 'lab' | 'chronicle'; coins: number; card: string; keys: [string, number, string][] }> = {
    lab1: { kind: 'lab', coins: 15, card: 'u-key', keys: [['q1', 1, 'The blue smear matches the blue ink on the art room door.'], ['q2', 0, 'Anyone in math class then could not have taken them.'], ['q3', 2, '12 times 4 is 48. Only 45 were found, so 3 are missing.']] },
    lab2: { kind: 'lab', coins: 15, card: 'u-cloak', keys: [['q1', 2, 'Cotton was found inside the bell.'], ['q2', 1, 'The next ring after 9:30 is 10:15.'], ['q3', 0, 'The fluff matches the rags in the rag closet.']] },
    chron1: { kind: 'chronicle', coins: 30, card: 'r-crystal', keys: [['s1', 1, 'The academy began when the first doors opened.'], ['s2', 0, 'The emblem was made of crystal light.'], ['s3', 2, 'Two gray wolves guarded the gates.'], ['s4', 1, '7 doors times 3 locks is 21 locks.'], ['s5', 0, 'Learning, kindness and effort keep the Nexus strong.']] },
  };
  const advRow = (heroId: string, caseId: string) => {
    const rows = (db.adv ??= []);
    let row = rows.find((r) => r.heroId === heroId && r.caseId === caseId);
    if (!row) { row = { heroId, caseId, solved: [], done: false }; rows.push(row); }
    return row;
  };
  const storyRow = (heroId: string, episode: string) => {
    const rows = (db.story ??= []);
    let row = rows.find((r) => r.heroId === heroId && r.episode === episode);
    if (!row) { row = { heroId, episode, panel: 0, done: false, choices: {}, solved: [] }; rows.push(row); }
    return row;
  };
  const storyEpisode = (episode: string) => {
    if (episode !== 'ep1') throw new Error('no such episode');
  };
  /** Mirrors streak_info() and quest_state(): worked out from the ledger, never stored. */
  const streakOf = (heroId: string): { days: number; start: string | null } => {
    const days = new Set(db.ledger.filter((r) => r.heroId === heroId && r.currency === 'coins' && /^daily:\d{4}-\d{2}-\d{2}$/.test(r.key)).map((r) => r.key.slice(6)));
    const dayBefore = (d: string) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() - 1); return t.toISOString().slice(0, 10); };
    const today = schoolDate(now());
    let at = days.has(today) ? today : dayBefore(today);
    let n = 0;
    let start: string | null = null;
    while (days.has(at)) { n++; start = at; at = dayBefore(at); }
    return { days: n, start };
  };
  const QUEST_MILES = [{ days: 3, coins: 5 }, { days: 7, coins: 15 }, { days: 14, coins: 30 }, { days: 30, coins: 60 }];
  const questFor = (heroId: string): QuestState => {
    const today = schoolDate(now());
    const mine = db.ledger.filter((r) => r.heroId === heroId && r.currency === 'coins');
    const { days, start } = streakOf(heroId);
    const learn = mine.filter((r) => r.key.startsWith('learn:') && r.day === today).length;
    return {
      streak: days,
      milestones: QUEST_MILES.map((m) => ({ ...m, reached: days >= m.days, claimed: mine.some((r) => r.key === `streak:${start}:${m.days}`) })),
      tasks: [
        { id: 'checkin', label: 'Collect your daily check-in', have: mine.some((r) => r.key === `daily:${today}`) ? 1 : 0, need: 1 },
        { id: 'learn', label: 'Get 3 Learn answers right', have: Math.min(learn, 3), need: 3 },
        { id: 'game', label: 'Collect an Arcade reward', have: mine.some((r) => r.key.startsWith('arcade:') && r.day === today) ? 1 : 0, need: 1 },
      ],
      questCoins: 10,
      questClaimed: mine.some((r) => r.key === `quest:${today}`),
    };
  };
  /** Mirrors title_unlocked(): each title is worked out from what the hero actually did. */
  const secretHint = (place: string) => `Look in the ${place} area of the Nexus.`;
  const mySquadId = (heroId: string) => (db.squads ?? []).find((q) => !q.disbanded && q.members.some((m) => m.childId === heroId && m.status === 'member'))?.id;
  /** This week's secret: the place and card follow the week unless the Sensei changes them. */
  const secretWeek = () => {
    const week = schoolWeek(now());
    if (!db.secret || db.secret.week !== week) {
      const n = Math.floor(new Date(`${week}T00:00:00Z`).getTime() / 604800000);
      const place = SECRET_PLACES[(n * 7) % SECRET_PLACES.length];
      const prizes = CARDS.filter((c) => c.rarity === 'rare' || c.rarity === 'epic');
      db.secret = { week, place, hint: secretHint(place), card: prizes[n % prizes.length].id, finds: [], winner: null, claims: [] };
    }
    return db.secret;
  };
  /** This week's boss, with health fixed the first time anyone looks. */
  const raidWeek = () => {
    const week = schoolWeek(now());
    if (!db.raid || db.raid.week !== week) {
      const n = Math.floor(new Date(`${week}T00:00:00Z`).getTime() / 604800000);
      db.raid = { week, boss: RAID_BOSSES[n % RAID_BOSSES.length].id, maxHp: Math.max(RAID_RULES.minHp, RAID_RULES.hpPerHero * Math.max(1, Object.keys(db.accounts).length)), strikes: [] };
    }
    return db.raid;
  };
  const raidPower = (heroId: string) => 10 + Math.min(60, 3 * db.history.filter((h) => h.childId === heroId && h.correct && schoolDate(new Date(h.servedAt)) === schoolDate(now())).length);
  const xpOf = (heroId: string) => db.ledger.filter((r) => r.heroId === heroId && r.currency === 'xp').reduce((s, r) => s + r.amount, 0);
  const unlockedTitles = (heroId: string): string[] => {
    const mine = db.ledger.filter((r) => r.heroId === heroId && r.currency === 'coins');
    const xp = db.ledger.filter((r) => r.heroId === heroId && r.currency === 'xp').reduce((s, r) => s + r.amount, 0);
    const adv = (db.adv ?? []).filter((a) => a.heroId === heroId && a.done).map((a) => a.caseId);
    return [
      'rookie',
      ...((db.story ?? []).some((s) => s.heroId === heroId && s.done) ? ['keeper'] : []),
      ...(adv.some((c) => c.startsWith('lab')) ? ['detective'] : []),
      ...(adv.includes('chron1') ? ['chronicler'] : []),
      ...(mine.some((r) => /^streak:.*:7$/.test(r.key)) ? ['streak'] : []),
      ...((db.cardInv ?? []).filter((c) => c.heroId === heroId && c.qty > 0).length >= 20 ? ['collector'] : []),
      ...(mine.some((r) => r.key.startsWith('hchal:')) ? ['helper'] : []),
      ...(xp >= 500 ? ['scholar'] : []),
    ];
  };
  const nextTriviaDate = (): string => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const [y, m, d] = schoolDate(now()).split('-').map(Number);
    const base = new Date(Date.UTC(y, m - 1, d));
    base.setUTCDate(base.getUTCDate() + ((days.indexOf(db.triviaNight.weekday) - base.getUTCDay() + 7) % 7));
    return base.toISOString().slice(0, 10);
  };
  const triviaFor = (hero: Account): TriviaState => {
    const date = nextTriviaDate();
    const rows = (db.trivia ?? []).filter((r) => r.date === date);
    return {
      date, time: db.triviaNight.time, today: date === schoolDate(now()),
      going: rows.find((r) => r.heroId === hero.id)?.going ?? null,
      goingCount: rows.filter((r) => r.going && Object.values(db.accounts).find((a) => a.id === r.heroId)?.grade === hero.grade).length,
    };
  };
  /** Squad mates and class mates (House) of a hero, never the hero. */
  const contestCircle = (heroId: string) => {
    const out = new Set<string>();
    const sq = (db.squads ?? []).find((q) => !q.disbanded && q.members.some((m) => m.childId === heroId && m.status === 'member'));
    sq?.members.filter((m) => m.status === 'member').forEach((m) => out.add(m.childId));
    const cls = db.members.find((m) => m.childId === heroId);
    if (cls) db.members.filter((m) => m.classId === cls.classId).forEach((m) => out.add(m.childId));
    out.delete(heroId);
    return [...out];
  };
  const meHero = (): Account => {
    const acct = Object.values(db.accounts).find((a) => a.id === db.current);
    if (!acct) throw new Error('not signed in as a hero');
    return acct;
  };
  const meAdult = (role?: Adult['role']): DemoAdult => {
    const a = db.adults.find((x) => x.id === db.current);
    if (!a || (role && (a.role !== role || !a.approved))) throw new Error(`not signed in as an approved ${role ?? 'grown-up'}`);
    return a;
  };
  const heroById = (id: string) => Object.values(db.accounts).find((a) => a.id === id);
  const isParentOf = (childId: string) => {
    const a = meAdult('parent');
    return db.parentLinks.some((l) => l.childId === childId && l.parentId === a.id);
  };
  /** A parent of the child, or the teacher of a class the child is in. */
  const canSeeChild = (childId: string) => {
    const a = db.adults.find((x) => x.id === db.current);
    if (a?.role === 'teacher' && a.approved) return db.members.some((m) => m.childId === childId && db.classes.some((c) => c.id === m.classId && c.teacherId === a.id));
    return isParentOf(childId);
  };
  const teaches = (classId: string) => {
    const t = meAdult('teacher');
    return db.classes.find((c) => c.id === classId && c.teacherId === t.id);
  };
  /** Two points per correct practice answer, like house_weekly() in the database. */
  const correctPoints = (heroId: string, week?: string) =>
    db.history.filter((h) => h.childId === heroId && h.correct && (!week || schoolWeek(new Date(h.servedAt)) === week)).length * 2;
  const hasSkill = (heroId: string) => (id: string) => (db.learnedSkills ??= []).some((x) => x.heroId === heroId && x.skillId === id);
  const surgeFor = (heroId: string) => {
    const row = (db.surge ??= []).find((x) => x.heroId === heroId) ?? (db.surge[db.surge.push({ heroId, streak: 0, until: 0 }) - 1]);
    return row;
  };
  const surgeView = (heroId: string, started = false) => {
    const row = surgeFor(heroId);
    const r = surgeRules(hasSkill(heroId));
    return { active: row.until > at(), secondsLeft: Math.max(0, Math.ceil((row.until - at()) / 1000)), streak: row.streak, need: r.need, mult: r.mult, started };
  };
  const qtyOf = (heroId: string, cardId: string) => (db.cardInv ??= []).find((c) => c.heroId === heroId && c.cardId === cardId)?.qty ?? 0;
  const addCard = (heroId: string, cardId: string, n: number) => {
    const row = (db.cardInv ??= []).find((c) => c.heroId === heroId && c.cardId === cardId);
    if (row) row.qty += n; else db.cardInv.push({ heroId, cardId, qty: n });
  };
  const metaOf = (heroId: string) => (db.cardMeta ??= []).find((m) => m.heroId === heroId) ?? (db.cardMeta[db.cardMeta.push({ heroId, opened: 0, showcase: [] }) - 1]);
  const packsLeft = (heroId: string) =>
    1 + Math.floor(db.history.filter((h) => h.childId === heroId && h.correct).length / 15)
    + db.homeMissions.filter((m) => m.childId === heroId && m.status === 'approved').length
    + db.submissions.filter((x) => x.childId === heroId && x.scorePct >= 80).length - metaOf(heroId).opened;
  /** In a class: chat as before. No class: chat only when everyone else in the room is a friend or squad mate. */
  const chatOpen = (me: string) => {
    if (db.members.some((m) => m.childId === me)) return true;
    const sq = mySquadId(me);
    return (db.room?.players ?? []).every((p) => p.id === me || areFriends(me, p.id) || (sq !== undefined && mySquadId(p.id) === sq));
  };
  const areFriends = (x: string, y: string) => (db.friendships ??= []).some((f) => f.status === 'accepted' && ((f.a === x && f.b === y) || (f.a === y && f.b === x)));
  const tradeFor = (id: string) => {
    const me = meHero().id;
    const t = (db.trades ??= []).find((x) => x.id === id);
    if (!t || (t.a !== me && t.b !== me)) throw new Error('not your trade');
    return { t, me, mine: t.a === me };
  };
  const tradeFair = (t: NonNullable<Db['trades']>[number]) => tradeFairness(t.offerA, t.offerB, (c) => qtyOf(t.a, c) > 0, (c) => qtyOf(t.b, c) > 0);
  const skillBalance = (heroId: string) => db.ledger.filter((l) => l.heroId === heroId && l.currency === 'skill_points').reduce((s, l) => s + l.amount, 0);
  const addDays = (date: string, n: number) => new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10);
  const liveEvents = (_today: string) => EVENTS.map((e) => ({ ...e, ...(db.eventEdits?.[e.id] ?? { enabled: true }) }));
  const eventLive = (id: string, today: string) => liveEvents(today).some((e) => e.id === id && e.enabled && today >= e.starts && today <= e.ends);
  const heroWeekPoints = (heroId: string) => correctPoints(heroId, schoolWeek(now()));
  const heroSeasonPoints = (heroId: string) => correctPoints(heroId);
  const tooManyTries = (actor: string, kind: 'link' | 'class') =>
    db.codeAttempts.filter((x) => x.actor === actor && x.kind === kind && at() - x.at < HOUR).length >= 10;

  /** Mirrors award() in the database: once per key, mission coins capped per school week. */
  function award(heroId: string, currency: Currency, amount: number, source: RewardSource, key: string) {
    if (db.ledger.some((r) => r.heroId === heroId && r.currency === currency && r.key === key)) {
      return { awarded: 0, duplicate: true, capped: false };
    }
    const week = schoolWeek(now());
    let grant = amount;
    const cap = currency === 'coins' ? WEEKLY_CAPS[source] : undefined;
    if (cap !== undefined) {
      const used = db.ledger
        .filter((r) => r.heroId === heroId && r.currency === 'coins' && r.source === source && r.week === week)
        .reduce((s, r) => s + r.amount, 0);
      grant = Math.max(0, Math.min(amount, cap - used));
    }
    db.ledger.push({ heroId, currency, amount: grant, source, key, week, day: schoolDate(now()) });
    commit();
    return { awarded: grant, duplicate: false, capped: grant < amount };
  }

  const learningFor = (childId: string): SubjectProgress[] => {
    const hero = Object.values(db.accounts).find((a) => a.id === childId);
    return SUBJECTS.map((subject) => {
      const done = db.history.filter((h) => h.childId === childId && h.answered && QUESTIONS.find((q) => q.id === h.questionId)?.subject === subject);
      const left = QUESTIONS.filter((q) => q.subject === subject && q.grade === hero?.grade && !db.history.some((h) => h.childId === childId && h.questionId === q.id)).length;
      return {
        subject, answered: done.length, correct: done.filter((h) => h.correct).length, left,
        skills: db.stats.filter((x) => x.childId === childId && x.subject === subject).map(({ skill, attempts, correct }) => ({ skill, attempts, correct })).sort((a, b) => a.skill.localeCompare(b.skill)),
      };
    });
  };
  const dailyKey = () => `daily:${schoolDate(now())}`;
  const homeView = ({ parentId: _p, ...m }: HomeRow): HomeMission => m;
  const classView = (c: ClassRow, withCode: boolean): ClassInfo => ({
    id: c.id, name: c.name, grade: c.grade,
    ...(withCode ? { joinCode: c.joinCode, members: db.members.filter((m) => m.classId === c.id).length } : {}),
  });

  const backend: Backend = {
    mode: 'demo',

    async restore(): Promise<Identity> {
      const hero = Object.values(db.accounts).find((a) => a.id === db.current);
      if (hero) return { kind: 'hero', hero: strip(hero) };
      const adult = db.adults.find((a) => a.id === db.current);
      return adult ? { kind: 'adult', adult: toAdult(adult) } : null;
    },
    async signOut() {
      db.current = null;
      commit();
    },

    // ---- Heroes -----------------------------------------------------------------------
    async signUp(input: SignUpInput) {
      const name = heroDisplayName(input.nameAdjective, input.nameNoun);
      if (!name || !isGrade(input.grade) || !isStarterHero(input.hero) || !isValidPicture(input.picture)) {
        throw new Error('invalid_request');
      }
      let code = generateHeroCode();
      while (db.accounts[code]) code = generateHeroCode();
      const acct: Account = {
        id: crypto.randomUUID(), heroCode: code, friendCode: generateCode(6), displayName: name, grade: input.grade, starter: input.hero,
        picture: input.picture, failures: [],
      };
      db.accounts[code] = acct;
      db.current = acct.id;
      commit();
      return strip(acct);
    },
    async signIn(heroCode, picture) {
      const acct = db.accounts[normalizeHeroCode(heroCode)];
      const t = at();
      const window = LOCKOUT_MINUTES * 60_000;
      if (acct) {
        const recent = acct.failures.filter((x) => t - x < window);
        if (recent.length >= MAX_FAILED_TRIES) {
          throw new SignInError('resting', { retryAfter: Math.ceil((recent[0] + window - t) / 1000) });
        }
        acct.failures = recent;
      }
      if (!acct || acct.picture.join() !== picture.join()) {
        if (acct) {
          acct.failures.push(t);
          commit();
        }
        throw new SignInError('wrong', { triesLeft: acct ? MAX_FAILED_TRIES - acct.failures.length : undefined });
      }
      acct.failures = [];
      db.current = acct.id;
      commit();
      return strip(acct);
    },
    async balances() {
      const out = emptyBalances();
      for (const r of db.ledger) if (r.heroId === meHero().id) out[r.currency] += r.amount;
      return out;
    },
    async dailyStatus() {
      const id = meHero().id;
      const taken = db.ledger.some((r) => r.heroId === id && r.currency === 'coins' && r.key === dailyKey());
      return { available: !taken, amount: DAILY_LOGIN_COINS + dailyBonus(hasSkill(id)) };
    },
    async claimDaily() {
      const r = award(meHero().id, 'coins', DAILY_LOGIN_COINS + dailyBonus(hasSkill(meHero().id)), 'daily', dailyKey());
      return { awarded: r.awarded, duplicate: r.duplicate };
    },
    async linkCode() {
      const id = meHero().id;
      let row = db.linkCodes.filter((c) => c.childId === id && !c.used && c.expiresAt > at()).pop();
      if (!row) {
        row = { childId: id, code: generateCode(8), expiresAt: at() + 7 * DAY, used: false };
        db.linkCodes.push(row);
        commit();
      }
      return { code: row.code, expiresAt: new Date(row.expiresAt).toISOString() };
    },
    async homeMissions() {
      const id = meHero().id;
      return db.homeMissions.filter((m) => m.childId === id).map(homeView);
    },
    async submitHomeMission(id) {
      const m = db.homeMissions.find((x) => x.id === id && x.childId === meHero().id);
      if (!m || (m.status !== 'assigned' && m.status !== 'sent_back')) throw new Error('mission not available');
      m.status = 'submitted';
      commit();
    },
    async myClass() {
      const link = db.members.find((m) => m.childId === meHero().id);
      const c = link && db.classes.find((x) => x.id === link.classId);
      return c ? classView(c, false) : null;
    },
    async joinClass(code) {
      const hero = meHero();
      if (tooManyTries(hero.id, 'class')) return { ok: false, error: 'too_many_tries' };
      if (db.members.some((m) => m.childId === hero.id)) return { ok: false, error: 'already_in_class' };
      const c = db.classes.find((x) => x.joinCode === normalizeHeroCode(code));
      if (!c) {
        db.codeAttempts.push({ actor: hero.id, kind: 'class', at: at() });
        commit();
        return { ok: false, error: 'invalid_code' };
      }
      if (c.grade !== hero.grade) return { ok: false, error: 'wrong_grade' };
      db.members.push({ classId: c.id, childId: hero.id });
      commit();
      return { ok: true, name: c.name };
    },
    async classMissions() {
      const hero = meHero();
      const link = db.members.find((m) => m.childId === hero.id);
      if (!link) return [];
      return db.classMissions.filter((m) => m.classId === link.classId).map((m): ClassMission => {
        const sub = db.submissions.find((s) => s.missionId === m.id && s.childId === hero.id);
        return {
          id: m.id, title: m.title, passage: m.passage, questions: m.questions, maxCoins: m.maxCoins,
          result: sub && { correct: sub.correct, total: sub.total, scorePct: sub.scorePct, coins: sub.coins, passed: sub.scorePct >= CLASS_PASS_PERCENT, alreadyDone: true },
        };
      });
    },
    async submitClassMission(id, answers) {
      const hero = meHero();
      const m = db.classMissions.find((x) => x.id === id);
      const inClass = m && db.members.some((x) => x.classId === m.classId && x.childId === hero.id);
      if (!m || !inClass) throw new Error('mission not found');
      const prior = db.submissions.find((s) => s.missionId === id && s.childId === hero.id);
      if (prior) {
        return { correct: prior.correct, total: prior.total, scorePct: prior.scorePct, coins: prior.coins, passed: prior.scorePct >= CLASS_PASS_PERCENT, alreadyDone: true };
      }
      if (answers.length !== m.questions.length) throw new Error('answer every question');
      const review = m.answers.map((right, i) => ({ correct: answers[i] === right, rightChoice: right, explanation: m.explanations[i] }));
      const correct = review.filter((r) => r.correct).length;
      const scorePct = Math.round((100 * correct) / m.questions.length);
      let coins = 0;
      if (scorePct >= CLASS_PASS_PERCENT) {
        coins = award(hero.id, 'coins', classMissionCoins(m.maxCoins, scorePct), 'class_mission', `class_mission:${id}`).awarded;
      }
      const result: ClassResult = { correct, total: m.questions.length, scorePct, coins, passed: scorePct >= CLASS_PASS_PERCENT, alreadyDone: false, review };
      const { review: _r, alreadyDone: _a, ...stored } = result;
      db.submissions.push({ missionId: id, childId: hero.id, ...stored });
      commit();
      return result;
    },
    async announcements() {
      const userId = db.current ?? '';
      const items = db.announcements.filter((a) => !(a as { deleted?: boolean }).deleted).sort((a, b) => b.id - a.id);
      const unread = items.filter((a) => !db.reads.some((r) => r.userId === userId && r.announcementId === a.id)).length;
      return { items, unread };
    },
    async pushKey() { return { configured: false, key: null }; },
    async pushPrefs() { return null; },
    async pushSetPrefs() { /* demo mode has no push */ },
    async pushSubscribe() { throw new Error('push is not available in demo mode'); },
    async pushUnsubscribe() { /* nothing to do */ },
    async markAnnouncementsRead() {
      const userId = db.current ?? '';
      for (const a of db.announcements.filter((x) => !(x as { deleted?: boolean }).deleted)) {
        if (!db.reads.some((r) => r.userId === userId && r.announcementId === a.id)) db.reads.push({ userId, announcementId: a.id });
      }
      commit();
    },

    // ---- Grown-ups ----------------------------------------------------------------------
    async adultSignUp(email, password, role, name) {
      const e = email.trim().toLowerCase();
      if (password.length < 6) throw new AdultAuthError('weak');
      if (db.adults.some((a) => a.email === e)) throw new AdultAuthError('taken');
      const displayName = name.trim();
      if (displayName.length < 2 || displayName.length > 60) throw new Error('name must be 2 to 60 characters');
      const adult: DemoAdult = { id: crypto.randomUUID(), role, displayName, approved: role === 'parent', email: e, password };
      db.adults.push(adult);
      db.current = adult.id;
      commit();
      return toAdult(adult);
    },
    async adultSignIn(email, password) {
      const a = db.adults.find((x) => x.email === email.trim().toLowerCase());
      if (!a || a.password !== password) throw new AdultAuthError('wrong');
      db.current = a.id;
      commit();
      return toAdult(a);
    },
    async claimLink(code) {
      const parent = meAdult('parent');
      if (tooManyTries(parent.id, 'link')) return { ok: false, error: 'too_many_tries' };
      const row = db.linkCodes.find((c) => c.code === normalizeHeroCode(code) && !c.used && c.expiresAt > at());
      if (!row) {
        db.codeAttempts.push({ actor: parent.id, kind: 'link', at: at() });
        commit();
        return { ok: false, error: 'invalid_code' };
      }
      row.used = true;
      if (!db.parentLinks.some((l) => l.childId === row.childId && l.parentId === parent.id)) {
        db.parentLinks.push({ childId: row.childId, parentId: parent.id });
      }
      commit();
      return { ok: true, childName: heroById(row.childId)!.displayName };
    },
    async children() {
      const parent = meAdult('parent');
      return db.parentLinks.filter((l) => l.parentId === parent.id).map((l) => {
        const h = heroById(l.childId)!;
        return {
          id: h.id, displayName: h.displayName, grade: h.grade, starter: h.starter,
          waiting: db.homeMissions.filter((m) => m.childId === h.id && m.status === 'submitted').length,
        };
      });
    },
    async childMissions(childId) {
      if (!isParentOf(childId)) throw new Error('not your child');
      return db.homeMissions.filter((m) => m.childId === childId).map(homeView);
    },
    async startPractice(subject) {
      const hero = meHero();
      if (!(SUBJECTS as readonly string[]).includes(subject)) throw new Error('unknown subject');
      const pool = QUESTIONS.filter((q) => q.subject === subject && q.grade === hero.grade);
      const seen = new Set(db.history.filter((h) => h.childId === hero.id).map((h) => h.questionId));
      const resumeMs = LEARNING_REWARDS.resumeMinutes * 60_000;
      const ids = db.history
        .filter((h) => h.childId === hero.id && !h.answered && at() - h.servedAt < resumeMs && pool.some((q) => q.id === h.questionId))
        .map((h) => h.questionId);
      const fresh = pool.filter((q) => !seen.has(q.id)).sort(() => Math.random() - 0.5).slice(0, Math.max(0, LEARNING_REWARDS.setSize - ids.length));
      for (const q of fresh) {
        db.history.push({ childId: hero.id, questionId: q.id, servedAt: at() });
        ids.push(q.id);
      }
      commit();
      const left = pool.filter((q) => !db.history.some((h) => h.childId === hero.id && h.questionId === q.id)).length;
      return {
        questions: ids.map((id) => QUESTIONS.find((q) => q.id === id)!).map(({ id, subject: sub, skill, prompt, choices }) => ({ id, subject: sub, skill, prompt, choices })),
        remaining: left,
      };
    },
    async answerQuestion(questionId, choice) {
      const hero = meHero();
      const row = db.history.find((h) => h.childId === hero.id && h.questionId === questionId);
      if (!row) throw new Error('that question was not handed to you');
      const q = QUESTIONS.find((x) => x.id === questionId)!;
      if (row.answered) return { correct: !!row.correct, rightChoice: q.answer, explanation: q.explanation, repeat: true };
      if (!Number.isInteger(choice) || choice < 0 || choice >= q.choices.length) throw new Error('pick one of the choices');
      const right = choice === q.answer;
      row.answered = true;
      row.correct = right;
      const stat = db.stats.find((x) => x.childId === hero.id && x.subject === q.subject && x.skill === q.skill)
        ?? (db.stats[db.stats.push({ childId: hero.id, subject: q.subject, skill: q.skill, attempts: 0, correct: 0 }) - 1]);
      stat.attempts += 1;
      if (right) stat.correct += 1;
      let awarded: AnswerResultAwarded | undefined;
      const surge = surgeFor(hero.id);
      const rules = surgeRules(hasSkill(hero.id));
      const surging = surge.until > at();
      let started = false;
      if (right) {
        const key = `learn:${questionId}`;
        let base = LEARNING_REWARDS.coins + (hasSkill(hero.id)('ex2') ? 1 : 0);
        if (surging) base = Math.round(base * rules.mult);
        const coins = award(hero.id, 'coins', base, 'learning', key);
        award(hero.id, 'xp', LEARNING_REWARDS.xp, 'learning', key);
        award(hero.id, 'skill_points', LEARNING_REWARDS.skillPoints, 'learning', key);
        awarded = { coins: coins.awarded, xp: LEARNING_REWARDS.xp, skillPoints: LEARNING_REWARDS.skillPoints, capped: coins.capped };
        if (!surging && surge.streak + 1 >= rules.need) { surge.streak = 0; surge.until = at() + rules.minutes * 60_000; started = true; }
        else surge.streak = surging ? 0 : surge.streak + 1;
      } else surge.streak = 0;
      commit();
      return { correct: right, rightChoice: q.answer, explanation: q.explanation, repeat: false, awarded, surge: surgeView(hero.id, started) };
    },
    async learning() {
      return learningFor(meHero().id);
    },
    async childLearning(childId) {
      if (!canSeeChild(childId)) throw new Error('not your child');
      return learningFor(childId);
    },
    async myWeek(weeksBack = 0) {
      const id = meHero().id;
      const week = schoolWeek(new Date(now().getTime() - 7 * 86400000 * Math.max(0, Math.min(12, weeksBack))));
      const rows = db.history.filter((h) => h.childId === id && h.answered && schoolWeek(new Date(h.servedAt)) === week);
      const bySubject = new Map<Subject, { answered: number; correct: number }>();
      for (const h of rows) {
        const s = QUESTIONS.find((q) => q.id === h.questionId)?.subject;
        if (!s) continue;
        const e = bySubject.get(s) ?? { answered: 0, correct: 0 };
        e.answered += 1; if (h.correct) e.correct += 1;
        bySubject.set(s, e);
      }
      const earned = db.ledger.filter((r) => r.heroId === id && r.currency === 'coins' && r.amount > 0 && r.week === week);
      return {
        weekStart: week,
        daysActive: new Set(rows.map((h) => schoolDate(new Date(h.servedAt)))).size,
        answered: rows.length, correct: rows.filter((h) => h.correct).length,
        subjects: [...bySubject].sort(([a], [b]) => a.localeCompare(b)).map(([subject, v]) => ({ subject, ...v })),
        points: earned.reduce((s, r) => s + r.amount, 0),
        missions: earned.filter((r) => r.source === 'home_mission' || r.source === 'class_mission').length,
      };
    },
    async classReport(classId, weeksBack = 0) {
      if (!teaches(classId)) throw new Error('not your class');
      const cls = db.classes.find((c) => c.id === classId)!;
      const students = [];
      for (const m of db.members.filter((x) => x.classId === classId)) {
        const hero = heroById(m.childId);
        if (!hero) continue;
        const w = await this.childWeek(m.childId, weeksBack);
        students.push({ id: m.childId, name: hero.displayName, daysActive: w.daysActive, answered: w.answered, correct: w.correct, points: w.points, missions: w.missions });
      }
      students.sort((a, b) => a.name.localeCompare(b.name));
      const weekStart = schoolWeek(new Date(now().getTime() - 7 * 86400000 * Math.max(0, Math.min(12, weeksBack))));
      return { weekStart, className: cls.name, students };
    },
    async childWeek(childId, weeksBack = 0) {
      if (!canSeeChild(childId)) throw new Error('not your child');
      const week = schoolWeek(new Date(now().getTime() - 7 * 86400000 * Math.max(0, Math.min(12, weeksBack))));
      const rows = db.history.filter((h) => h.childId === childId && h.answered && schoolWeek(new Date(h.servedAt)) === week);
      const bySubject = new Map<Subject, { answered: number; correct: number }>();
      for (const h of rows) {
        const s = QUESTIONS.find((q) => q.id === h.questionId)?.subject;
        if (!s) continue;
        const e = bySubject.get(s) ?? { answered: 0, correct: 0 };
        e.answered += 1; if (h.correct) e.correct += 1;
        bySubject.set(s, e);
      }
      const earned = db.ledger.filter((r) => r.heroId === childId && r.currency === 'coins' && r.amount > 0 && r.week === week);
      return {
        weekStart: week,
        daysActive: new Set(rows.map((h) => schoolDate(new Date(h.servedAt)))).size,
        answered: rows.length, correct: rows.filter((h) => h.correct).length,
        subjects: [...bySubject].sort(([a], [b]) => a.localeCompare(b)).map(([subject, v]) => ({ subject, ...v })),
        points: earned.reduce((s, r) => s + r.amount, 0),
        missions: earned.filter((r) => r.source === 'home_mission' || r.source === 'class_mission').length,
      };
    },
    async childProgress(childId) {
      if (!isParentOf(childId)) throw new Error('not your child');
      const week = schoolWeek(now());
      const sum = (f: (r: LedgerRow) => boolean) => db.ledger.filter((r) => r.heroId === childId && f(r)).reduce((s, r) => s + r.amount, 0);
      return {
        coins: sum((r) => r.currency === 'coins'),
        xp: sum((r) => r.currency === 'xp'),
        homeWeek: sum((r) => r.currency === 'coins' && r.source === 'home_mission' && r.week === week),
        classWeek: sum((r) => r.currency === 'coins' && r.source === 'class_mission' && r.week === week),
        homeCap: WEEKLY_CAPS.home_mission!,
        classCap: WEEKLY_CAPS.class_mission!,
      };
    },
    async createHomeMission(childId, title, details, coins) {
      if (!isParentOf(childId)) throw new Error('not your child');
      if (!Number.isInteger(coins) || coins < 1 || coins > 100) throw new Error('coins must be 1 to 100');
      if (!title.trim() || title.trim().length > 80) throw new Error('title must be 1 to 80 characters');
      db.homeMissions.push({
        id: crypto.randomUUID(), childId, parentId: meAdult().id, title: title.trim(), details: details.trim().slice(0, 500),
        coins, status: 'assigned' as HomeMissionStatus,
      });
      commit();
    },
    async reviewHomeMission(id, approve) {
      const m = db.homeMissions.find((x) => x.id === id);
      if (!m || !isParentOf(m.childId)) throw new Error('mission not found');
      if (m.status !== 'submitted') throw new Error('mission is not waiting for approval');
      if (!approve) {
        m.status = 'sent_back';
        commit();
        return { status: 'sent_back', awarded: 0 };
      }
      m.status = 'approved';
      const r = award(m.childId, 'coins', m.coins, 'home_mission', `home_mission:${id}`);
      return { status: 'approved', awarded: r.awarded, capped: r.capped };
    },
    async classes() {
      const t = meAdult('teacher');
      return db.classes.filter((c) => c.teacherId === t.id).map((c) => classView(c, true));
    },
    async createClass(name, grade) {
      const t = meAdult('teacher');
      if (!isGrade(grade) || !name.trim()) throw new Error('invalid class');
      let joinCode = generateCode(6);
      while (db.classes.some((c) => c.joinCode === joinCode)) joinCode = generateCode(6);
      const row: ClassRow = { id: crypto.randomUUID(), teacherId: t.id, name: name.trim().slice(0, 60), grade, joinCode };
      db.classes.push(row);
      commit();
      return classView(row, true);
    },
    async createClassMission(classId, mission: NewClassMission) {
      if (!teaches(classId)) throw new Error('not your class');
      const n = mission.questions.length;
      if (n < 3 || n > 10) throw new Error('a mission needs 3 to 10 questions');
      if (mission.answers.length !== n || mission.explanations.length !== n) throw new Error('every question needs an answer and an explanation');
      mission.questions.forEach((q, i) => {
        if (!q.prompt.trim() || q.choices.length < 2 || q.choices.length > 4 || !(mission.answers[i] >= 0 && mission.answers[i] < q.choices.length)) {
          throw new Error(`question ${i + 1} is not valid`);
        }
      });
      db.classMissions.push({
        id: crypto.randomUUID(), classId, title: mission.title.trim(), passage: mission.passage, questions: mission.questions,
        maxCoins: mission.maxCoins, answers: mission.answers, explanations: mission.explanations,
      });
      commit();
    },
    async classResults(classId): Promise<ClassMissionResults[]> {
      if (!teaches(classId)) throw new Error('not your class');
      return db.classMissions.filter((m) => m.classId === classId).map((m) => ({
        id: m.id, title: m.title,
        submissions: db.submissions.filter((s) => s.missionId === m.id).map((s) => ({
          childId: s.childId, childName: heroById(s.childId)!.displayName, scorePct: s.scorePct, coins: s.coins,
        })),
      }));
    },
    async resetSubmission(missionId, childId) {
      const m = db.classMissions.find((x) => x.id === missionId);
      if (!m || !teaches(m.classId)) throw new Error('not your class');
      db.submissions = db.submissions.filter((s) => !(s.missionId === missionId && s.childId === childId));
      commit();
    },
    async adultRequestReset() { /* demo mode has no email to send */ },
    resetPending() { return false; },
    async adultSetPassword(password) {
      const a = meAdult();
      if (password.length < 8) throw new AdultAuthError('weak');
      a.password = password;
      commit();
    },
    async arcadeStatus() {
      const id = meHero().id;
      const today = schoolDate(now());
      const claimed = ARCADE_REWARDS.games.filter((g) => db.ledger.some((r) => r.heroId === id && r.currency === 'coins' && r.key === `arcade:${g}:${today}`));
      return { coins: ARCADE_REWARDS.coins, games: [...ARCADE_REWARDS.games], claimed };
    },
    async arcadeClaim(game) {
      const id = meHero().id;
      if (!(ARCADE_REWARDS.games as readonly string[]).includes(game)) throw new Error('unknown game');
      const key = `arcade:${game}:${schoolDate(now())}`;
      const r = award(id, 'coins', ARCADE_REWARDS.coins, 'game', key);
      if (!r.duplicate) award(id, 'xp', ARCADE_REWARDS.xp, 'game', key);
      return { awarded: r.awarded, duplicate: r.duplicate, capped: r.capped };
    },
    async friends() {
      const me = meHero().id;
      const list = (db.friendships ??= []);
      const hero = (id: string) => heroById(id)!;
      return {
        friends: list.filter((f) => f.status === 'accepted' && (f.a === me || f.b === me)).map((f) => {
          const h = hero(f.a === me ? f.b : f.a);
          return { id: f.id, heroId: h.id, name: h.displayName, grade: h.grade, starter: h.starter };
        }),
        incoming: list.filter((f) => f.status === 'pending' && f.b === me).map((f) => ({ id: f.id, name: hero(f.a).displayName, grade: hero(f.a).grade, starter: hero(f.a).starter })),
        outgoing: list.filter((f) => f.status === 'pending' && f.a === me).map((f) => ({ id: f.id, name: hero(f.b).displayName })),
      };
    },
    async requestFriend(code) {
      const me = meHero();
      const other = Object.values(db.accounts).find((a) => a.friendCode === normalizeHeroCode(code));
      if (!other) throw new Error('no hero has that code');
      if (other.id === me.id) throw new Error('that is your own code');
      const list = (db.friendships ??= []);
      const row = list.find((f) => (f.a === me.id && f.b === other.id) || (f.a === other.id && f.b === me.id));
      if (row && (row.status === 'pending' || row.status === 'accepted')) throw new Error('already friends or waiting');
      if (row) Object.assign(row, { a: me.id, b: other.id, status: 'pending' });
      else list.push({ id: generateCode(10), a: me.id, b: other.id, status: 'pending' });
      commit();
      return other.displayName;
    },
    async friendCodeReset() {
      const acct = Object.values(db.accounts).find((a) => a.id === meHero().id)!;
      acct.friendCode = generateCode(6);
      commit();
      return acct.friendCode;
    },
    async respondFriend(id, accept) {
      const me = meHero().id;
      const row = (db.friendships ??= []).find((f) => f.id === id && f.b === me && f.status === 'pending');
      if (!row) throw new Error('no such request');
      row.status = accept ? 'accepted' : 'declined';
      commit();
    },
    async removeFriend(id) {
      const me = meHero().id;
      const row = (db.friendships ??= []).find((f) => f.id === id && f.status === 'accepted' && (f.a === me || f.b === me));
      if (!row) throw new Error('not your friend');
      row.status = 'removed';
      commit();
    },
    async mySquad() {
      const me = meHero().id;
      const squads = (db.squads ??= []).filter((s) => !s.disbanded);
      const mine = squads.find((s) => s.members.some((m) => m.childId === me && m.status === 'member'));
      return {
        squad: mine ? {
          id: mine.id, name: mine.name, leader: mine.leader === me,
          members: mine.members.filter((m) => m.status === 'member' || (m.status === 'invited' && mine.leader === me)).map((m) => {
            const h = heroById(m.childId)!;
            return { heroId: h.id, name: h.displayName, starter: h.starter, status: m.status as 'member' | 'invited', isLeader: h.id === mine.leader };
          }).sort((a, b) => Number(b.isLeader) - Number(a.isLeader)),
        } : null,
        invites: squads.filter((s) => s.members.some((m) => m.childId === me && m.status === 'invited'))
          .map((s) => ({ squadId: s.id, name: s.name, leaderName: heroById(s.leader)!.displayName })),
      };
    },
    async createSquad(adjective, noun) {
      const me = meHero().id;
      if (!SQUAD_WORDS.adjectives.includes(adjective) || !SQUAD_WORDS.nouns.includes(noun)) throw new Error('pick a name from the list');
      const squads = (db.squads ??= []);
      if (squads.some((s) => !s.disbanded && s.members.some((m) => m.childId === me && m.status === 'member'))) throw new Error('leave your squad first');
      squads.push({ id: generateCode(10), leader: me, name: `${adjective} ${noun}`, disbanded: false, members: [{ childId: me, status: 'member' }] });
      commit();
    },
    async inviteToSquad(friendHeroId) {
      const me = meHero().id;
      const squad = (db.squads ??= []).find((s) => !s.disbanded && s.leader === me);
      if (!squad) throw new Error('only a squad leader can invite');
      if (!(db.friendships ??= []).some((f) => f.status === 'accepted' && ((f.a === me && f.b === friendHeroId) || (f.b === me && f.a === friendHeroId)))) throw new Error('you can only invite friends');
      if (squad.members.filter((m) => m.status === 'member' || m.status === 'invited').length >= SQUAD_WORDS.maxMembers) throw new Error('the squad is full');
      const row = squad.members.find((m) => m.childId === friendHeroId);
      if (row) { if (row.status === 'declined' || row.status === 'left') row.status = 'invited'; }
      else squad.members.push({ childId: friendHeroId, status: 'invited' });
      commit();
    },
    async respondSquadInvite(squadId, accept) {
      const me = meHero().id;
      const squads = (db.squads ??= []);
      if (accept && squads.some((s) => !s.disbanded && s.members.some((m) => m.childId === me && m.status === 'member'))) throw new Error('leave your squad first');
      const row = squads.find((s) => s.id === squadId && !s.disbanded)?.members.find((m) => m.childId === me && m.status === 'invited');
      if (!row) throw new Error('no such invite');
      row.status = accept ? 'member' : 'declined';
      commit();
    },
    async leaveSquad() {
      const me = meHero().id;
      const squad = (db.squads ??= []).find((s) => !s.disbanded && s.members.some((m) => m.childId === me && m.status === 'member'));
      if (!squad) return;
      if (squad.leader === me) squad.disbanded = true;
      else squad.members.find((m) => m.childId === me)!.status = 'left';
      commit();
    },
    async cardsState() {
      const id = meHero().id;
      return { packs: packsLeft(id), cards: (db.cardInv ??= []).filter((c) => c.heroId === id && c.qty > 0).map((c) => ({ id: c.cardId, qty: c.qty })).sort((a, b) => a.id.localeCompare(b.id)), showcase: metaOf(id).showcase, total: CARDS.length };
    },
    async openPack() {
      const id = meHero().id;
      if (packsLeft(id) <= 0) throw new Error('no packs to open');
      metaOf(id).opened += 1;
      const out: { id: string; new: boolean }[] = [];
      for (let i = 0; i < 3; i++) {
        const roll = Math.random() * 100;
        const rarity: Rarity = roll < 70 ? 'common' : roll < 90 ? 'uncommon' : roll < 98 ? 'rare' : 'epic';
        const pool = CARDS.filter((c) => c.rarity === rarity);
        const card = pool[Math.floor(Math.random() * pool.length)];
        out.push({ id: card.id, new: qtyOf(id, card.id) === 0 });
        addCard(id, card.id, 1);
      }
      commit();
      return { cards: out, packs: packsLeft(id) };
    },
    async setShowcase(cardIds) {
      const id = meHero().id;
      if (cardIds.length > 3) throw new Error('pick up to 3 favourites');
      if (cardIds.some((c) => qtyOf(id, c) <= 0)) throw new Error('you do not own that card');
      metaOf(id).showcase = [...new Set(cardIds)];
      commit();
    },
    async tradeOpen(friendHeroId) {
      const me = meHero().id;
      if (friendHeroId === me || !areFriends(me, friendHeroId)) throw new Error('you can only trade with friends');
      const open = (db.trades ??= []).find((t) => t.status === 'open' && ((t.a === me && t.b === friendHeroId) || (t.a === friendHeroId && t.b === me)));
      if (open) return open.id;
      const t = { id: crypto.randomUUID(), a: me, b: friendHeroId, offerA: [], offerB: [], ver: 1, confA: 0, confB: 0, status: 'open' as const };
      db.trades.push(t);
      commit();
      return t.id;
    },
    async tradeList() {
      const me = meHero().id;
      return (db.trades ??= []).filter((t) => t.status === 'open' && (t.a === me || t.b === me)).map((t) => {
        const other = heroById(t.a === me ? t.b : t.a)!;
        return { id: t.id, friend: other.displayName, friendId: other.id, startedByMe: t.a === me };
      });
    },
    async tradeView(tradeId) {
      const { t, mine } = tradeFor(tradeId);
      const f = tradeFair(t);
      return {
        id: t.id, status: t.status, ver: t.ver, friend: heroById(mine ? t.b : t.a)!.displayName, friendId: mine ? t.b : t.a,
        myOffer: mine ? t.offerA : t.offerB, theirOffer: mine ? t.offerB : t.offerA,
        iConfirmed: (mine ? t.confA : t.confB) === t.ver, theyConfirmed: (mine ? t.confB : t.confA) === t.ver,
        fairness: { level: f.level, iGiveMore: f.givingMore === (mine ? 'a' : 'b') },
      };
    },
    async tradeSet(tradeId, offer) {
      const { t, me, mine } = tradeFor(tradeId);
      if (t.status !== 'open') throw new Error('this trade is closed');
      const seen = new Set<string>();
      let total = 0;
      for (const o of offer) {
        if (!Number.isInteger(o.qty) || o.qty < 1 || o.qty > 5 || seen.has(o.card) || !cardById(o.card)) throw new Error('offer is not valid');
        if (qtyOf(me, o.card) < o.qty) throw new Error('you do not have those cards');
        seen.add(o.card); total += o.qty;
      }
      if (total > 6) throw new Error('a trade can hold up to 6 cards per side');
      const next = offer.map((o) => ({ card: o.card, qty: o.qty })).sort((x, y) => x.card.localeCompare(y.card));
      if (mine) t.offerA = next; else t.offerB = next;
      t.ver += 1; t.confA = 0; t.confB = 0;
      commit();
    },
    async tradeConfirm(tradeId, ver, ack) {
      const { t, mine } = tradeFor(tradeId);
      if (t.status !== 'open') throw new Error('this trade is closed');
      if (t.ver !== ver) return { ok: false, reason: 'changed' };
      const lvl = tradeFair(t).level;
      if (lvl === 'empty' || lvl === 'blocked') throw new Error('this trade is too lopsided');
      if (lvl === 'uneven' && !ack) throw new Error('please confirm the uneven trade');
      if (mine) t.confA = t.ver; else t.confB = t.ver;
      if (t.confA !== t.ver || t.confB !== t.ver) { commit(); return { ok: true, done: false }; }
      if (t.offerA.some((o) => qtyOf(t.a, o.card) < o.qty) || t.offerB.some((o) => qtyOf(t.b, o.card) < o.qty)) {
        t.confA = 0; t.confB = 0; commit();
        return { ok: false, reason: 'missing_cards' };
      }
      for (const o of t.offerA) { addCard(t.a, o.card, -o.qty); addCard(t.b, o.card, o.qty); }
      for (const o of t.offerB) { addCard(t.b, o.card, -o.qty); addCard(t.a, o.card, o.qty); }
      t.status = 'done';
      commit();
      return { ok: true, done: true };
    },
    async tradeCancel(tradeId) {
      const { t } = tradeFor(tradeId);
      if (t.status === 'open') { t.status = 'cancelled'; commit(); }
    },
    async questState() {
      return questFor(meHero().id);
    },
    async questClaim() {
      const me = meHero().id;
      const q = questFor(me);
      if (q.tasks.some((t) => t.have < t.need)) throw new Error('finish all three tasks first');
      if (q.questClaimed) return { awarded: 0, duplicate: true };
      award(me, 'xp', 5, 'streak', `quest:${schoolDate(now())}`);
      const r = award(me, 'coins', 10, 'streak', `quest:${schoolDate(now())}`);
      return { awarded: r.awarded, duplicate: r.duplicate };
    },
    async streakClaim(days) {
      const me = meHero().id;
      const q = questFor(me);
      const m = q.milestones.find((x) => x.days === days);
      if (!m) throw new Error('no such milestone');
      if (!m.reached) throw new Error('not there yet');
      const r = award(me, 'coins', m.coins, 'streak', `streak:${streakOf(me).start}:${days}`);
      return { awarded: r.awarded, duplicate: r.duplicate };
    },
    async storyState() {
      const me = meHero().id;
      const r = storyRow(me, 'ep1');
      return [{ episode: 'ep1', panel: r.panel, completed: r.done, choices: { ...r.choices }, solved: [...r.solved] }];
    },
    async storySave(episode, panel) {
      storyEpisode(episode);
      const r = storyRow(meHero().id, episode);
      r.panel = Math.max(r.panel, Math.min(Math.max(panel, 0), 200));
      commit();
    },
    async storyChoose(episode, panelId, option) {
      const me = meHero().id;
      const reward = STORY_CHOICES[`${episode}:${panelId}:${option}`];
      if (!reward) throw new Error('no such choice');
      const r = storyRow(me, episode);
      if (r.choices[panelId]) return { repeat: true, option: r.choices[panelId] };
      r.choices[panelId] = option;
      award(me, reward.currency, reward.amount, 'event', `story:${episode}:${panelId}`);
      return { repeat: false, option, currency: reward.currency, amount: reward.amount };
    },
    async storyAnswer(episode, checkpoint, choice) {
      const me = meHero().id;
      const key = STORY_KEYS[`${episode}:${checkpoint}`];
      if (!key) throw new Error('no such checkpoint');
      if (!Number.isInteger(choice) || choice < 0 || choice >= key.choices) throw new Error('pick one of the choices');
      if (choice !== key.answer) return { correct: false };
      const r = storyRow(me, episode);
      const first = !r.solved.includes(checkpoint);
      if (first) {
        r.solved.push(checkpoint);
        award(me, 'coins', 5, 'event', `story:${episode}:${checkpoint}`);
        award(me, 'xp', 5, 'event', `story:${episode}:${checkpoint}`);
      }
      commit();
      return { correct: true, rightChoice: key.answer, explanation: key.explanation, first };
    },
    async advState() {
      const me = meHero().id;
      return Object.entries(ADV).map(([caseId, c]) => {
        const r = advRow(me, caseId);
        return { case: caseId, kind: c.kind, solved: [...r.solved], done: r.done };
      });
    },
    async advAnswer(caseId, step, choice) {
      const me = meHero().id;
      const c = ADV[caseId];
      const idx = c?.keys.findIndex((k) => k[0] === step) ?? -1;
      if (!c || idx < 0) throw new Error('no such step');
      if (!Number.isInteger(choice) || choice < 0 || choice > 2) throw new Error('pick one of the choices');
      const r = advRow(me, caseId);
      if (c.kind === 'chronicle' && idx > 0 && !r.solved.includes(c.keys[idx - 1][0])) throw new Error('that clue is still sealed');
      const [, answer, explanation] = c.keys[idx];
      if (choice !== answer) return { correct: false };
      const first = !r.solved.includes(step);
      if (first) {
        r.solved.push(step);
        award(me, 'coins', 5, 'event', `adv:${caseId}:${step}`);
        award(me, 'xp', 5, 'event', `adv:${caseId}:${step}`);
      }
      commit();
      return { correct: true, rightChoice: answer, explanation, first };
    },
    async advComplete(caseId) {
      const me = meHero().id;
      const c = ADV[caseId];
      if (!c) throw new Error('no such case');
      const r = advRow(me, caseId);
      if (r.solved.length < c.keys.length) throw new Error('answer every question first');
      if (r.done) return { repeat: true, card: c.card };
      r.done = true;
      award(me, 'coins', c.coins, 'event', `adv:${caseId}:done`);
      addCard(me, c.card, 1);
      commit();
      return { repeat: false, card: c.card, coins: c.coins };
    },
    async storyComplete(episode) {
      const me = meHero().id;
      storyEpisode(episode);
      const r = storyRow(me, episode);
      if (r.solved.length < 3) throw new Error('answer every checkpoint first');
      if (r.done) return { repeat: true, card: 'e-keeper' };
      r.done = true;
      r.panel = 200;
      award(me, 'coins', 20, 'event', `story:${episode}:done`);
      addCard(me, 'e-keeper', 1);
      commit();
      return { repeat: false, card: 'e-keeper', coins: 20 };
    },
    async senseiDeleteHero(heroCode) {
      meAdult('sensei');
      const code = normalizeHeroCode(heroCode);
      const acct = db.accounts[code];
      if (!acct) throw new Error('no hero has that code');
      delete db.accounts[code];
      if (db.current === acct.id) db.current = null;
      commit();
      return acct.displayName;
    },
    async senseiGiveCard(heroCode, cardId) {
      meAdult('sensei');
      const acct = db.accounts[normalizeHeroCode(heroCode)];
      if (!acct) throw new Error('no hero has that code');
      if (!cardById(cardId)) throw new Error('no such card');
      addCard(acct.id, cardId, 1);
      commit();
      return acct.displayName;
    },
    async skillState() {
      const id = meHero().id;
      const has = hasSkill(id);
      return {
        points: skillBalance(id), surge: surgeView(id),
        skills: SKILLS.map((k) => ({ ...k, learned: has(k.id), ready: k.tier === 1 || has(SKILLS.find((p) => p.tree === k.tree && p.tier === k.tier - 1)!.id) }))
          .sort((a, b) => a.tree.localeCompare(b.tree) || a.tier - b.tier),
      };
    },
    async skillLearn(skillId) {
      const id = meHero().id;
      const k = SKILLS.find((x) => x.id === skillId);
      if (!k) throw new Error('no such skill');
      const has = hasSkill(id);
      if (has(k.id)) return { ok: false, reason: 'already_learned' };
      if (k.tier > 1 && !has(SKILLS.find((p) => p.tree === k.tree && p.tier === k.tier - 1)!.id)) return { ok: false, reason: 'locked' };
      if (skillBalance(id) < k.cost) return { ok: false, reason: 'not_enough_points' };
      db.ledger.push({ heroId: id, currency: 'skill_points', amount: -k.cost, source: 'purchase', key: `skill:${k.id}`, week: schoolWeek(now()) });
      db.learnedSkills!.push({ heroId: id, skillId: k.id });
      commit();
      return { ok: true };
    },
    async nexlingState() {
      const hero = meHero();
      const n = (db.nexlings ??= []).find((x) => x.heroId === hero.id);
      if (!n) return { stages: NEXLING_STAGES, mine: null };
      const bonus = nexlingType(n.type)!.bonus;
      const mult = growthMultipliers(hasSkill(hero.id));
      const growth = Math.floor(db.ledger.slice(n.fromLedger).filter((r) => r.heroId === hero.id && r.currency === 'coins' && r.amount > 0)
        .reduce((sum, r) => sum + (r.source === bonus ? r.amount * mult.bonus : r.amount), 0) * mult.all);
      const stage = NEXLING_STAGES.filter((t) => t <= growth).length;
      return { stages: NEXLING_STAGES, mine: { type: n.type, nickname: n.nickname, color: n.color, growth, stage, nextAt: NEXLING_STAGES.find((t) => t > growth) ?? null } };
    },
    async nexlingAdopt(type, nickname, color) {
      const hero = meHero();
      if (!nexlingType(type)) throw new Error('no such Nexling');
      const name = nickname.trim().replace(/\s+/g, ' ');
      if (!/^[A-Za-z][A-Za-z '-]{1,15}$/.test(name)) throw new Error('names are 2 to 16 letters');
      if (!HOUSE_COLORS.includes(color)) throw new Error('pick a colour');
      const row = (db.nexlings ??= []).find((x) => x.heroId === hero.id);
      if (!row) db.nexlings.push({ heroId: hero.id, type, nickname: name, color, fromLedger: db.ledger.length });
      else { if (row.type !== type) row.fromLedger = db.ledger.length; row.type = type; row.nickname = name; row.color = color; }
      commit();
    },
    async shopState() {
      const hero = meHero();
      const bal = await this.balances();
      const owned = new Set((db.owned ??= []).filter((o) => o.heroId === hero.id).map((o) => o.itemId));
      const today = schoolDate(now());
      const events = liveEvents(today);
      return {
        coins: bal.coins, xp: bal.xp,
        events: events.filter((e) => e.enabled && e.ends >= today && e.starts <= addDays(today, 14)).map((e) => ({ id: e.id, name: e.name, icon: e.icon, blurb: e.blurb, starts: e.starts, ends: e.ends, live: today >= e.starts })),
        items: SHOP_ITEMS.filter((i) => !i.event || owned.has(i.id) || eventLive(i.event, today)).map((i) => ({ id: i.id, kind: i.kind, slot: i.slot, name: i.name, icon: i.icon, price: i.price, unlockXp: i.unlock_xp, event: i.event ?? null, owned: owned.has(i.id), locked: i.unlock_xp > bal.xp }))
          .sort((a, b) => a.unlockXp - b.unlockXp || a.price - b.price || a.id.localeCompare(b.id)),
        equipped: Object.fromEntries((db.equipped ??= []).filter((e) => e.heroId === hero.id).map((e) => [e.slot, e.itemId])),
      };
    },
    async shopBuy(itemId) {
      const hero = meHero();
      const item = itemById(itemId);
      if (!item) throw new Error('no such item');
      if ((db.owned ??= []).some((o) => o.heroId === hero.id && o.itemId === itemId)) return { ok: false, reason: 'already_owned' };
      const bal = await this.balances();
      if (item.event && !eventLive(item.event, schoolDate(now()))) return { ok: false, reason: 'event_over' };
      if (item.unlock_xp > bal.xp) return { ok: false, reason: 'locked' };
      if (bal.coins < item.price) return { ok: false, reason: 'not_enough_coins' };
      db.ledger.push({ heroId: hero.id, currency: 'coins', amount: -item.price, source: 'purchase', key: `shop:${itemId}`, week: schoolWeek(now()) });
      db.owned.push({ heroId: hero.id, itemId });
      commit();
      return { ok: true };
    },
    async heroEquip(slot, itemId) {
      const hero = meHero();
      if (!['outfit', 'hat', 'face', 'back'].includes(slot)) throw new Error('no such slot');
      if (itemId !== null) {
        const item = itemById(itemId);
        if (!item || item.slot !== slot) throw new Error('that does not go there');
        if (!(db.owned ??= []).some((o) => o.heroId === hero.id && o.itemId === itemId)) throw new Error('you do not own that yet');
      }
      const row = (db.equipped ??= []).find((e) => e.heroId === hero.id && e.slot === slot);
      if (row) row.itemId = itemId; else db.equipped.push({ heroId: hero.id, slot, itemId });
      commit();
    },
    async dormGet(friendHeroId) {
      const me = meHero();
      const owner = friendHeroId ? heroById(friendHeroId) : me;
      if (!owner) throw new Error('only friends can visit');
      if (owner.id !== me.id && !(db.friendships ??= []).some((f) => f.status === 'accepted' && ((f.a === me.id && f.b === owner.id) || (f.b === me.id && f.a === owner.id)))) {
        throw new Error('only friends can visit');
      }
      return {
        mine: owner.id === me.id, name: owner.displayName, starter: owner.starter,
        emote: (db.showcase ?? []).find((s) => s.heroId === owner.id)?.emote ?? 'wave',
        layout: [...((db.rooms ??= []).find((r) => r.heroId === owner.id)?.layout ?? [])].sort((a, b) => a.cell - b.cell),
        equipped: Object.fromEntries((db.equipped ??= []).filter((e) => e.heroId === owner.id && e.itemId).map((e) => [e.slot, e.itemId])),
        owned: owner.id === me.id ? (db.owned ??= []).filter((o) => o.heroId === me.id && itemById(o.itemId)?.kind === 'decor').map((o) => o.itemId) : null,
      };
    },
    async dormSave(layout) {
      const hero = meHero();
      const cells = new Set<number>(), items = new Set<string>();
      if (layout.length > 24) throw new Error('room layout is not valid');
      for (const e of layout) {
        if (!Number.isInteger(e.cell) || e.cell < 0 || e.cell > 23 || cells.has(e.cell) || items.has(e.item)) throw new Error('room layout is not valid');
        if (itemById(e.item)?.kind !== 'decor' || !(db.owned ??= []).some((o) => o.heroId === hero.id && o.itemId === e.item)) throw new Error('you do not own that decoration');
        cells.add(e.cell); items.add(e.item);
      }
      const row = (db.rooms ??= []).find((r) => r.heroId === hero.id);
      const next = layout.map((e) => ({ item: e.item, cell: e.cell }));
      if (row) row.layout = next; else db.rooms.push({ heroId: hero.id, layout: next });
      commit();
    },
    async houseState() {
      const hero = meHero();
      const weekPoints = Math.min(heroWeekPoints(hero.id), HOUSE_CAP);
      const link = db.members.find((m) => m.childId === hero.id);
      if (!link) return { state: 'no_class', weekPoints, cap: HOUSE_CAP };
      const house = (db.houses ??= []).find((h) => h.classId === link.classId);
      if (house) {
        return { state: 'active', weekPoints, cap: HOUSE_CAP, house: { ...house, id: house.classId },
          className: db.classes.find((c) => c.id === link.classId)?.name, members: db.members.filter((m) => m.classId === link.classId).length };
      }
      const vote = (db.houseOptions ??= []).find((v) => v.classId === link.classId && v.open);
      if (vote) return { state: 'voting', weekPoints, cap: HOUSE_CAP, options: vote.options, myVote: vote.votes[hero.id] ?? null };
      return { state: 'none', weekPoints, cap: HOUSE_CAP };
    },
    async showcaseState() {
      const me = meHero().id;
      const row = (db.showcase ?? []).find((s) => s.heroId === me);
      return { title: row?.title ?? 'rookie', pose: row?.pose ?? 'stand', emote: (row?.emote ?? 'wave') as EmoteId, xp: xpOf(me), unlocked: unlockedTitles(me) };
    },
    async emoteSet(emote) {
      const me = meHero().id;
      const e = EMOTES.find((x) => x.id === emote);
      if (!e || e.xp > xpOf(me)) throw new Error('you have not unlocked that emote yet');
      const rows = (db.showcase ??= []);
      const row = rows.find((s) => s.heroId === me);
      if (row) row.emote = emote; else rows.push({ heroId: me, title: 'rookie', pose: 'stand', emote });
      commit();
    },
    async showcaseSet(title, pose) {
      const me = meHero().id;
      if (!['stand', 'cheer', 'cool', 'power'].includes(pose)) throw new Error('no such pose');
      if (!unlockedTitles(me).includes(title)) throw new Error('you have not earned that title yet');
      const rows = (db.showcase ??= []);
      const row = rows.find((s) => s.heroId === me);
      if (row) { row.title = title; row.pose = pose as Pose; } else rows.push({ heroId: me, title, pose: pose as Pose });
      commit();
    },
    async houseChallenge() {
      const hero = meHero();
      const c = db.challenge && db.challenge.week === schoolWeek(now()) ? db.challenge : null;
      if (!c) return { state: 'none' };
      const link = db.members.find((m) => m.childId === hero.id);
      const house = link && (db.houses ??= []).find((h) => h.classId === link.classId);
      if (!link || !house) return { state: 'no_house', theme: c.theme, goal: c.goal, coins: c.coins };
      const mates = db.members.filter((m) => m.classId === link.classId);
      const progress = Math.round((mates.reduce((s, m) => s + Math.min(heroWeekPoints(m.childId), HOUSE_CAP), 0) / Math.max(mates.length, 1)) * 10) / 10;
      const mine = Math.min(heroWeekPoints(hero.id), HOUSE_CAP);
      return { state: 'active', theme: c.theme, goal: c.goal, coins: c.coins, progress, reached: progress >= c.goal, myPoints: mine, needMine: 10,
               claimed: db.ledger.some((r) => r.heroId === hero.id && r.currency === 'coins' && r.key === `hchal:${c.week}`) };
    },
    async raidState() {
      const hero = meHero();
      const r = raidWeek();
      const damage = r.strikes.reduce((n, x) => n + x.damage, 0);
      const mine = r.strikes.filter((x) => x.heroId === hero.id);
      const claimed = db.ledger.some((l) => l.heroId === hero.id && l.currency === 'coins' && l.key === `raid:${r.week}`);
      const boss = RAID_BOSSES.find((b) => b.id === r.boss)!;
      return {
        boss: { id: boss.id, name: boss.name, icon: boss.icon, blurb: boss.blurb },
        maxHp: r.maxHp, damage: Math.min(damage, r.maxHp), defeated: damage >= r.maxHp,
        strikers: new Set(r.strikes.map((x) => x.heroId)).size,
        struckToday: mine.some((x) => x.day === schoolDate(now())),
        power: raidPower(hero.id), myDamage: mine.reduce((n, x) => n + x.damage, 0),
        canClaim: damage >= r.maxHp && mine.length > 0 && !claimed, claimed,
        reward: { coins: RAID_RULES.coins, xp: RAID_RULES.xp },
      };
    },
    async raidStrike() {
      const hero = meHero();
      const r = raidWeek();
      const total = r.strikes.reduce((n, x) => n + x.damage, 0);
      if (total >= r.maxHp) return { ok: false, reason: 'defeated' as const };
      if (r.strikes.some((x) => x.heroId === hero.id && x.day === schoolDate(now()))) return { ok: false, reason: 'already_struck' as const };
      const damage = raidPower(hero.id);
      r.strikes.push({ heroId: hero.id, day: schoolDate(now()), damage });
      commit();
      return { ok: true, damage, defeated: total + damage >= r.maxHp };
    },
    async raidClaim() {
      const hero = meHero();
      const r = raidWeek();
      if (r.strikes.reduce((n, x) => n + x.damage, 0) < r.maxHp) throw new Error('not_defeated');
      if (!r.strikes.some((x) => x.heroId === hero.id)) throw new Error('did_not_strike');
      const key = `raid:${r.week}`;
      award(hero.id, 'xp', RAID_RULES.xp, 'event', key);
      const res = award(hero.id, 'coins', RAID_RULES.coins, 'event', key);
      return { awarded: res.awarded, duplicate: res.duplicate };
    },
    async secretState() {
      const hero = meHero();
      const w = secretWeek();
      const mine = mySquadId(hero.id);
      const card = cardById(w.card)!;
      return {
        place: w.place, hint: w.hint, found: w.finds.includes(hero.id), finders: w.finds.length, won: !!w.winner,
        winnerSquad: w.winner ? (db.squads ?? []).find((q) => q.id === w.winner!.squadId)?.name ?? null : null,
        mySquadWon: !!w.winner && w.winner.squadId === mine, claimed: w.claims.includes(hero.id),
        card: { id: card.id, name: card.name, icon: card.icon },
      };
    },
    async secretFind() {
      const hero = meHero();
      const w = secretWeek();
      if (w.finds.includes(hero.id)) return { ok: false };
      w.finds.push(hero.id);
      const squad = mySquadId(hero.id);
      let firstSquad = false;
      if (squad && !w.winner) { w.winner = { squadId: squad, by: hero.id }; firstSquad = true; }
      award(hero.id, 'coins', 5, 'event', `secret:${w.week}`);
      commit();
      return { ok: true, firstSquad };
    },
    async secretClaim() {
      const hero = meHero();
      const w = secretWeek();
      if (!w.winner || w.winner.squadId !== mySquadId(hero.id) || w.claims.includes(hero.id)) return { ok: false };
      w.claims.push(hero.id);
      const row = (db.cardInv ??= []).find((c) => c.heroId === hero.id && c.cardId === w.card);
      if (row) row.qty += 1; else db.cardInv.push({ heroId: hero.id, cardId: w.card, qty: 1 });
      commit();
      return { ok: true };
    },
    async senseiSecret() {
      meAdult('sensei');
      const w = secretWeek();
      return { place: w.place, hint: w.hint, card: w.card, finders: w.finds.length, winnerSquad: w.winner ? (db.squads ?? []).find((q) => q.id === w.winner!.squadId)?.name ?? null : null };
    },
    async senseiSecretSet(place, hint, card) {
      meAdult('sensei');
      const w = secretWeek();
      if (!(SECRET_PLACES as readonly string[]).includes(place)) throw new Error('no such place');
      if (w.finds.length) throw new Error('someone already found this one');
      if (!cardById(card)) throw new Error('no such card');
      w.place = place; w.card = card; w.hint = hint.trim().slice(0, 120) || secretHint(place);
      commit();
    },
    async stickerList() {
      const me = meHero().id;
      const all = (db.stickers ??= []);
      return {
        stickers: all.filter((x) => x.owner === me).sort((a, b) => b.id - a.id).map(({ id, hero, bg, frame, deco, word }) => ({ id, hero, bg, frame, deco, word })),
        madeToday: all.filter((x) => x.maker === me && x.day === schoolDate(now())).length,
      };
    },
    async stickerMake(design) {
      const me = meHero().id;
      const all = (db.stickers ??= []);
      if (!HEROES.some((h) => h.id === design.hero) || !STICKER_BGS.some((b) => b.id === design.bg) || !(STICKER_FRAMES as readonly string[]).includes(design.frame)
        || !(STICKER_DECOS as readonly string[]).includes(design.deco) || !(STICKER_WORDS as readonly string[]).includes(design.word)) throw new Error('pick from the lists');
      if (all.filter((x) => x.maker === me && x.day === schoolDate(now())).length >= STICKER_DAILY) return { ok: false, reason: 'daily_limit' as const };
      if (all.filter((x) => x.owner === me).length >= STICKER_MAX) return { ok: false, reason: 'full' as const };
      const bal = await this.balances();
      if (bal.coins < STICKER_COST) throw new Error('not enough points');
      const id = Math.max(0, ...all.map((x) => x.id)) + 1;
      db.ledger.push({ heroId: me, currency: 'coins', amount: -STICKER_COST, source: 'purchase', key: `sticker:${id}`, week: schoolWeek(now()) });
      all.push({ id, maker: me, owner: me, ...design, day: schoolDate(now()) });
      commit();
      return { ok: true };
    },
    async stickerGive(stickerId, toHero) {
      const me = meHero().id;
      const all = (db.stickers ??= []);
      if (toHero === me || mySquadId(me) === undefined || mySquadId(me) !== mySquadId(toHero)) throw new Error('you can only give stickers to your squad');
      if (all.filter((x) => x.owner === toHero).length >= STICKER_MAX) return { ok: false, reason: 'full' as const };
      const s = all.find((x) => x.id === stickerId && x.owner === me);
      if (!s) throw new Error('that is not your sticker');
      s.owner = toHero;
      commit();
      return { ok: true };
    },
    async kindState() {
      const me = meHero().id;
      const sq = (db.squads ?? []).find((q) => !q.disbanded && q.members.some((m) => m.childId === me && m.status === 'member'));
      const list = (db.kind ??= []);
      return {
        nominatedToday: list.some((k) => k.nominator === me && k.day === schoolDate(now())),
        mates: (sq?.members ?? []).filter((m) => m.status === 'member' && m.childId !== me).map((m) => ({ id: m.childId, name: heroById(m.childId)!.displayName })),
        received: list.filter((k) => k.nominee === me && k.status === 'approved').slice(-10).reverse().map((k) => ({ reason: k.reason, day: k.day })),
      };
    },
    async kindNominate(heroId, reason) {
      const me = meHero().id;
      if (!KIND_REASONS.some((r) => r.id === reason)) throw new Error('pick one of the reasons');
      if (!(await this.kindState()).mates.some((m) => m.id === heroId)) throw new Error('you can nominate a squad mate');
      const list = (db.kind ??= []);
      if (list.some((k) => k.nominator === me && k.day === schoolDate(now()))) throw new Error('you already nominated someone today');
      list.push({ id: list.length + 1, nominator: me, nominee: heroId, reason, day: schoolDate(now()), at: at(), status: 'pending' });
      commit();
    },
    async kindReview() {
      const a = meAdult();
      if (a.role !== 'sensei' && a.role !== 'teacher') throw new Error('only teachers and the Sensei can review');
      const list = (db.kind ??= []);
      return list.filter((k) => k.status === 'pending' && (a.role === 'sensei' || canSeeChild(k.nominee))).map((k) => ({
        id: k.id, nominator: heroById(k.nominator)!.displayName, nominee: heroById(k.nominee)!.displayName, reason: k.reason, day: k.day,
        repeat: list.some((r) => r.nominator === k.nominee && r.nominee === k.nominator && r.at > k.at - 7 * 86400000),
      }));
    },
    async kindDecide(id, approve) {
      const a = meAdult();
      const k = (db.kind ??= []).find((x) => x.id === id && x.status === 'pending');
      if (!k) throw new Error('that nomination is not waiting');
      if (!(a.role === 'sensei' || (a.role === 'teacher' && canSeeChild(k.nominee)))) throw new Error('that is not your student');
      k.status = approve ? 'approved' : 'skipped';
      commit();
      if (!approve) return { awarded: 0 };
      const week = schoolWeek(new Date(k.at));
      const given = db.kind!.filter((x) => x.nominee === k.nominee && x.status === 'approved' && x.id !== k.id && schoolWeek(new Date(x.at)) === week).length;
      if (given >= KIND_WEEKLY_MAX) return { awarded: 0 };
      return { awarded: award(k.nominee, 'coins', KIND_REWARD, 'event', `kind:${k.id}`).awarded };
    },
    async hintFor(questionId, subject) {
      return { hint: fallbackHint(subject, questionId), ai: false, left: null };
    },
    async goofyState() {
      const me = meHero().id, day = schoolDate(now());
      const g = (db.goofy ??= []).find((x) => x.heroId === me && x.day === day);
      return { status: g?.status ?? null, prompt: g?.prompt ?? null, doneToday: db.goofy!.filter((x) => x.day === day && x.status === 'done').length };
    },
    async goofyAccept() {
      const me = meHero().id, day = schoolDate(now());
      const list = (db.goofy ??= []);
      if (!list.some((x) => x.heroId === me && x.day === day)) { list.push({ heroId: me, day, prompt: Math.floor(Math.random() * GOOFY.length), status: 'accepted' }); commit(); }
      return this.goofyState();
    },
    async goofyFinish(done) {
      const me = meHero().id, day = schoolDate(now());
      const g = (db.goofy ??= []).find((x) => x.heroId === me && x.day === day);
      if (!g || g.status !== 'accepted') throw new Error('no challenge waiting');
      g.status = done ? 'done' : 'skipped';
      commit();
      return { awarded: done ? award(me, 'coins', GOOFY_REWARD, 'event', `goofy:${day}`).awarded : 0 };
    },
    async raceState(back = 0) {
      const hero = meHero();
      const d = schoolDate(now());
      const month = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1 - Math.min(Math.max(back, 0), 1), 1)).toISOString().slice(0, 10);
      const link = db.members.find((m) => m.childId === hero.id);
      const mine = link && db.classes.find((c) => c.id === link.classId);
      const rows = [
        { name: 'Room 4', grade: 5, members: 22, total: back ? 1380 : 910, mine: false },
        { name: 'Room 9', grade: 6, members: 24, total: back ? 1210 : 1040, mine: false },
        { name: 'Room 12', grade: 5, members: 21, total: back ? 990 : 760, mine: false },
        ...(mine ? [{ name: mine.name, grade: mine.grade, members: db.members.filter((m) => m.classId === mine.id).length, total: back ? 0 : Math.min(heroSeasonPoints(hero.id), HOUSE_CAP * 4), mine: true }] : []),
      ];
      return { month, minMembers: 3, classes: rows.map((r) => ({ ...r, rank: 1 + rows.filter((o) => o.total > r.total).length })).sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name)) };
    },
    async lookGet() {
      const me = meHero().id;
      const l = (db.looks ??= []).find((x) => x.heroId === me);
      const owned = (db.owned ??= []).filter((o) => o.heroId === me).map((o) => o.itemId);
      return {
        hair: l?.hair ?? 'brown', makeup: l?.makeup ?? 'none', aura: l?.aura ?? 'none', outfit: l?.outfit ?? null, accessory: l?.accessory ?? null, pinned: !!l?.pinned,
        likes: (db.lookLikes ??= []).filter((k) => k.owner === me && k.version === (l?.version ?? 1)).length,
        outfits: owned.filter((id) => itemById(id)?.kind === 'outfit'), accessories: owned.filter((id) => itemById(id)?.kind === 'accessory'),
      };
    },
    async lookSave(look, pinned) {
      const me = meHero().id;
      if (!HAIR.some((h) => h.id === look.hair) || !MAKEUP.some((m) => m.id === look.makeup) || !AURAS.some((a) => a.id === look.aura)) throw new Error('pick from the lists');
      const owns = (id: string | null, kind: string) => id === null || ((db.owned ??= []).some((o) => o.heroId === me && o.itemId === id) && itemById(id)?.kind === kind);
      if (!owns(look.outfit, 'outfit')) throw new Error('you do not own that outfit');
      if (!owns(look.accessory, 'accessory')) throw new Error('you do not own that accessory');
      const all = (db.looks ??= []);
      const l = all.find((x) => x.heroId === me);
      if (!l) all.push({ heroId: me, ...look, pinned, version: 1, at: now().getTime() });
      else {
        const changed = l.hair !== look.hair || l.makeup !== look.makeup || l.aura !== look.aura || l.outfit !== look.outfit || l.accessory !== look.accessory;
        Object.assign(l, look, { pinned, at: now().getTime(), version: changed ? l.version + 1 : l.version });
      }
      commit();
    },
    async lookGallery() {
      const me = meHero().id;
      const circle = new Set([...contestCircle(me), ...(db.friendships ??= []).filter((f) => f.status === 'accepted' && (f.a === me || f.b === me)).map((f) => (f.a === me ? f.b : f.a))]);
      return (db.looks ??= []).filter((l) => l.pinned && circle.has(l.heroId)).sort((a, b) => b.at - a.at).slice(0, 30).map((l) => {
        const h = heroById(l.heroId)!;
        const likes = (db.lookLikes ??= []).filter((k) => k.owner === l.heroId && k.version === l.version);
        return { hero: h.id, name: h.displayName, starter: h.starter, hair: l.hair, makeup: l.makeup, aura: l.aura, outfit: l.outfit, accessory: l.accessory, likes: likes.length, liked: likes.some((k) => k.liker === me) };
      });
    },
    async lookLike(heroId) {
      const me = meHero().id;
      const l = (db.looks ??= []).find((x) => x.heroId === heroId && x.pinned);
      const circle = new Set([...contestCircle(me), ...(db.friendships ??= []).filter((f) => f.status === 'accepted' && (f.a === me || f.b === me)).map((f) => (f.a === me ? f.b : f.a))]);
      if (!l || !circle.has(heroId)) throw new Error('you can only like looks from friends, your squad or your House');
      const likes = (db.lookLikes ??= []);
      if (likes.some((k) => k.owner === heroId && k.liker === me && k.version === l.version)) throw new Error('you already liked this look');
      likes.push({ owner: heroId, liker: me, version: l.version });
      commit();
    },
    async baseGet() {
      const me = meHero().id;
      const sq = mySquadId(me);
      if (sq === undefined) return { squad: null, items: [], owned: [], limit: 6 };
      return {
        squad: (db.squads ?? []).find((q) => q.id === sq)!.name,
        items: (db.squadBase ??= []).filter((b) => b.squadId === sq).sort((a, b) => a.cell - b.cell).map((b) => ({ cell: b.cell, item: b.item, by: heroById(b.by)?.displayName ?? 'Hero', mine: b.by === me })),
        owned: (db.owned ??= []).filter((o) => o.heroId === me && itemById(o.itemId)?.kind === 'decor').map((o) => o.itemId),
        limit: 6,
      };
    },
    async basePlace(cell, item) {
      const me = meHero().id;
      const sq = mySquadId(me);
      const all = (db.squadBase ??= []);
      if (sq === undefined) throw new Error('join a squad first');
      if (!Number.isInteger(cell) || cell < 0 || cell > 23) throw new Error('pick a spot in the hideout');
      if (!(db.owned ??= []).some((o) => o.heroId === me && o.itemId === item && itemById(item)?.kind === 'decor')) throw new Error('you do not own that decoration');
      const there = all.find((b) => b.squadId === sq && b.cell === cell);
      if (there && there.by !== me) throw new Error('that spot is taken');
      if (all.some((b) => b.squadId === sq && b.item === item && b.by !== me)) throw new Error('that decoration is already in the hideout');
      db.squadBase = all.filter((b) => !(b.squadId === sq && b.by === me && (b.item === item || b.cell === cell)));
      if (db.squadBase.filter((b) => b.squadId === sq && b.by === me).length >= 6) throw new Error('you can place up to 6 decorations');
      db.squadBase.push({ squadId: sq, cell, item, by: me });
      commit();
    },
    async jamHit(pads) {
      const me = meHero().id;
      const sq = mySquadId(me);
      if (sq === undefined) throw new Error('join a squad first');
      const clean = pads.filter((p) => Number.isInteger(p) && p >= 0 && p < 24).slice(0, 8);
      if (!clean.length) return;
      const all = (db.jam ??= []);
      const mine = all.find((j) => j.squadId === sq && j.heroId === me);
      if (mine) { mine.seq += clean.length; mine.pads = [...mine.pads, ...clean].slice(-8); mine.at = Date.now(); }
      else all.push({ squadId: sq, heroId: me, seq: clean.length, pads: clean, at: Date.now() });
      commit();
    },
    async jamFeed() {
      const me = meHero().id;
      const sq = mySquadId(me);
      if (sq === undefined) return { squad: null, mates: [] };
      return {
        squad: (db.squads ?? []).find((q) => q.id === sq)!.name,
        mates: (db.jam ??= []).filter((j) => j.squadId === sq && j.heroId !== me && Date.now() - j.at < 300000)
          .map((j) => ({ id: j.heroId, name: heroById(j.heroId)?.displayName ?? 'Hero', seq: j.seq, pads: j.pads, live: Date.now() - j.at < 20000 })),
      };
    },
    async baseRemove(cell) {
      const me = meHero().id;
      const sq = mySquadId(me);
      const all = (db.squadBase ??= []);
      if (!all.some((b) => b.squadId === sq && b.cell === cell && b.by === me)) throw new Error('that is not your decoration');
      db.squadBase = all.filter((b) => !(b.squadId === sq && b.cell === cell));
      commit();
    },
    async treasureState() {
      const me = meHero().id;
      const week = schoolWeek(now());
      const h = huntIndex(week);
      const p = (db.treasure ??= []).find((x) => x.week === week && x.heroId === me);
      return { hunt: h, step: p?.step ?? 0, steps: 4, done: (p?.step ?? 0) >= 4, claimed: !!p?.claimed, card: HUNTS[h].card };
    },
    async treasureFind(place) {
      const me = meHero().id;
      const week = schoolWeek(now());
      const all = (db.treasure ??= []);
      let p = all.find((x) => x.week === week && x.heroId === me);
      if (!p) { p = { week, heroId: me, step: 0, claimed: false }; all.push(p); }
      if (p.step >= 4 || HUNTS[huntIndex(week)].steps[p.step].place !== place) return { ok: false };
      award(me, 'coins', TREASURE_COIN, 'event', `treasure:${week}:${p.step}`);
      p.step += 1;
      commit();
      return { ok: true, done: p.step >= 4 };
    },
    async treasureClaim() {
      const me = meHero().id;
      const week = schoolWeek(now());
      const p = (db.treasure ??= []).find((x) => x.week === week && x.heroId === me);
      if (!p || p.step < 4 || p.claimed) return { ok: false };
      p.claimed = true;
      const inv = (db.cardInv ??= []);
      const have = inv.find((c) => c.heroId === me && c.cardId === HUNTS[huntIndex(week)].card);
      if (have) have.qty += 1; else inv.push({ heroId: me, cardId: HUNTS[huntIndex(week)].card, qty: 1 });
      commit();
      return { ok: true };
    },
    async badgeWall() {
      const me = meHero().id;
      const out: string[] = [];
      const hist = db.history.filter((h) => h.childId === me);
      if (hist.length) out.push('first-steps');
      if (hist.filter((h) => h.correct).length >= 50) out.push('brainiac');
      if (db.ledger.filter((l) => l.heroId === me && l.source === 'daily').length >= 7) out.push('streak-master');
      if (mySquadId(me) !== undefined) out.push('squad-up');
      if ((db.friendships ??= []).filter((f) => f.status === 'accepted' && (f.a === me || f.b === me)).length >= 3) out.push('friendly');
      if ((db.cardInv ??= []).filter((c) => c.heroId === me && c.qty > 0).length >= 10) out.push('collector');
      if ((db.owned ??= []).filter((o) => o.heroId === me).length >= 3) out.push('fashionista');
      if ((db.nexlings ??= []).some((n) => n.heroId === me)) out.push('pet-parent');
      if ((db.story ??= []).some((x) => x.heroId === me && x.done)) out.push('story-finisher');
      if (db.raid?.strikes.some((x) => x.heroId === me)) out.push('boss-buster');
      if (db.secret?.finds.includes(me)) out.push('sparkle-spotter');
      if ((db.comics ??= []).some((c) => c.maker === me)) out.push('comic-creator');
      if ((db.stickers ??= []).some((x) => x.maker === me)) out.push('sticker-star');
      if ((db.codes ??= []).some((c) => c.used.includes(me))) out.push('code-cracker');
      if ((db.contest ??= { entries: [], votes: [], claims: [] }).entries.some((e) => e.heroId === me)) out.push('room-showoff');
      if (db.ledger.some((l) => l.heroId === me && l.source === 'purchase')) out.push('big-spender');
      return out;
    },
    async codeCreate(classId, coins, xp, announce = false) {
      const a = meAdult();
      if (a.role !== 'sensei' && a.role !== 'teacher') throw new Error('only teachers and the Sensei');
      const sensei = a.role === 'sensei';
      const all = (db.codes ??= []);
      const day = schoolDate(now());
      const lim = sensei ? CODE_LIMITS.sensei : CODE_LIMITS.teacher;
      if (!sensei && (!classId || !db.classes.some((c) => c.id === classId && c.teacherId === a.id))) throw new Error('pick one of your classes');
      if (coins > lim.coins || xp > lim.xp) throw new Error(sensei ? 'too much for one code' : 'teacher codes can give up to 5 diamonds and 25 stars');
      if (coins < 0 || xp < 0 || coins + xp <= 0) throw new Error('give at least something');
      const today = all.filter((c) => c.by === a.id && c.day === day).length;
      if (!sensei && today >= 1) throw new Error('you already made a code today');
      if (sensei && today >= 5) throw new Error('five codes a day is the limit');
      let code = '';
      do { code = `${CODE_WORDS_A[Math.floor(Math.random() * 16)]}-${CODE_WORDS_B[Math.floor(Math.random() * 16)]}-${10 + Math.floor(Math.random() * 90)}`; } while (all.some((c) => c.code === code));
      all.push({ id: Math.max(0, ...all.map((c) => c.id)) + 1, code, by: a.id, classId: sensei ? null : classId, coins, xp, day, expires: now().getTime() + 7 * 86400000, used: [] });
      if (sensei && announce) db.announcements.push({ id: Math.max(0, ...db.announcements.map((x) => x.id)) + 1, title: 'Secret code!', body: `Type this code in the Nexus to win a prize: ${code}`, createdAt: now().toISOString() });
      commit();
      return code;
    },
    async codeMine() {
      const a = meAdult();
      return (db.codes ??= []).filter((c) => c.by === a.id).sort((x, y) => y.id - x.id).slice(0, 10)
        .map((c) => ({ id: c.id, code: c.code, coins: c.coins, xp: c.xp, expiresAt: new Date(c.expires).toISOString(), className: db.classes.find((k) => k.id === c.classId)?.name ?? null, redeemed: c.used.length }));
    },
    async codeRedeem(code) {
      const me = meHero().id;
      const tries = (db.codeTries ??= []);
      if (tries.filter((t) => t.heroId === me && t.at > now().getTime() - 3600000).length >= 5) return { ok: false, reason: 'too_many_tries' };
      const word = code.trim().toUpperCase().replace(/\s+/g, '-');
      const c = (db.codes ??= []).find((x) => x.code === word && x.expires > now().getTime());
      if (!c || (c.classId && !db.members.some((m) => m.classId === c.classId && m.childId === me))) { tries.push({ heroId: me, at: now().getTime() }); commit(); return { ok: false, reason: 'not_found' }; }
      if (c.used.includes(me)) return { ok: false, reason: 'already_used' };
      c.used.push(me);
      if (c.coins) award(me, 'coins', c.coins, 'event', `code:${c.id}`);
      if (c.xp) award(me, 'xp', c.xp, 'event', `code:${c.id}`);
      commit();
      return { ok: true, coins: c.coins, xp: c.xp };
    },
    async contestState() {
      const me = meHero().id;
      const c = (db.contest ??= { entries: [], votes: [], claims: [] });
      const week = schoolWeek(now());
      const last = schoolWeek(new Date(now().getTime() - 7 * 86400000));
      const circle = contestCircle(me);
      const myLast = c.votes.filter((v) => v.week === last && v.entry === me).length;
      const best = Math.max(0, ...circle.map((h) => c.votes.filter((v) => v.week === last && v.entry === h).length));
      return {
        theme: contestTheme(week), entered: c.entries.some((e) => e.week === week && e.heroId === me),
        hasRoom: ((db.rooms ??= []).find((r) => r.heroId === me)?.layout.length ?? 0) > 0,
        voted: c.votes.some((v) => v.week === week && v.voter === me),
        entries: c.entries.filter((e) => e.week === week && circle.includes(e.heroId)).map((e) => {
          const h = heroById(e.heroId)!;
          return { hero: h.id, name: h.displayName, starter: h.starter, layout: (db.rooms ??= []).find((r) => r.heroId === h.id)?.layout ?? [], mineVote: c.votes.some((v) => v.week === week && v.voter === me && v.entry === h.id) };
        }),
        last: { theme: contestTheme(last), entered: c.entries.some((e) => e.week === last && e.heroId === me), votes: myLast, won: myLast > 0 && myLast >= best, claimed: c.claims.some((x) => x.week === last && x.heroId === me) },
      };
    },
    async contestEnter() {
      const hero = meHero();
      const c = (db.contest ??= { entries: [], votes: [], claims: [] });
      const week = schoolWeek(now());
      if (!((db.rooms ??= []).find((r) => r.heroId === hero.id)?.layout.length)) throw new Error('decorate your room first');
      if (!c.entries.some((e) => e.week === week && e.heroId === hero.id)) c.entries.push({ week, heroId: hero.id });
      award(hero.id, 'coins', CONTEST_POINTS.enter, 'event', `contest-enter:${week}`);
      commit();
    },
    async contestVote(heroId) {
      const me = meHero().id;
      const c = (db.contest ??= { entries: [], votes: [], claims: [] });
      const week = schoolWeek(now());
      if (!c.entries.some((e) => e.week === week && e.heroId === heroId) || !contestCircle(me).includes(heroId)) throw new Error('you can only vote for your squad or House');
      if (c.votes.some((v) => v.week === week && v.voter === me)) throw new Error('you already voted this week');
      c.votes.push({ week, voter: me, entry: heroId });
      award(me, 'coins', CONTEST_POINTS.vote, 'event', `contest-vote:${week}`);
      commit();
    },
    async contestClaim() {
      const me = meHero().id;
      const s = await this.contestState();
      if (!s.last.won || s.last.claimed) return { ok: false };
      const last = schoolWeek(new Date(now().getTime() - 7 * 86400000));
      db.contest!.claims.push({ week: last, heroId: me });
      award(me, 'coins', CONTEST_POINTS.win, 'event', `contest-win:${last}`);
      return { ok: true };
    },
    async comicList() {
      const me = meHero().id;
      return (db.comics ??= []).filter((c) => c.maker === me && !c.deleted).sort((a, b) => b.id - a.id).map((c) => ({ id: c.id, panels: c.panels, shared: c.shared }));
    },
    async comicSquad() {
      const me = meHero().id;
      const sq = mySquadId(me);
      if (sq === undefined) return [];
      return (db.comics ??= []).filter((c) => c.shared && !c.deleted && c.maker !== me && mySquadId(c.maker) === sq).sort((a, b) => b.id - a.id)
        .map((c) => ({ id: c.id, panels: c.panels, maker: Object.values(db.accounts).find((a) => a.id === c.maker)?.displayName ?? 'Hero' }));
    },
    async comicMake(panels) {
      const me = meHero().id;
      const all = (db.comics ??= []);
      const ok = Array.isArray(panels) && panels.length === 3 && panels.every((p) => HEROES.some((h) => h.id === p.hero) && COMIC_SCENES.some((s) => s.id === p.scene)
        && (COMIC_POSES as readonly string[]).includes(p.pose) && (COMIC_LINES as readonly string[]).includes(p.line));
      if (!ok) throw new Error('pick from the lists');
      if (all.filter((c) => c.maker === me && !c.deleted).length >= COMIC_MAX) throw new Error('your comic shelf is full');
      all.push({ id: Math.max(0, ...all.map((c) => c.id)) + 1, maker: me, panels: panels.map((p) => ({ hero: p.hero, scene: p.scene, pose: p.pose, line: p.line })) as ComicPanels, shared: false });
      commit();
    },
    async comicShare(id, share) {
      const me = meHero().id;
      const c = (db.comics ??= []).find((x) => x.id === id && x.maker === me && !x.deleted);
      if (!c) throw new Error('that is not your comic');
      if (share && mySquadId(me) === undefined) throw new Error('join a squad to share');
      c.shared = share;
      commit();
    },
    async comicDelete(id) {
      const me = meHero().id;
      const c = (db.comics ??= []).find((x) => x.id === id && x.maker === me && !x.deleted);
      if (!c) throw new Error('that is not your comic');
      c.deleted = true; c.shared = false;
      commit();
    },
    async houseChallengeClaim() {
      const hero = meHero();
      const s = await this.houseChallenge();
      if (s.state !== 'active') throw new Error('no challenge for your House');
      if (!s.reached) throw new Error('your House has not reached the goal yet');
      if ((s.myPoints ?? 0) < (s.needMine ?? 10)) throw new Error('earn at least 10 points yourself first');
      const key = `hchal:${db.challenge!.week}`;
      award(hero.id, 'xp', 5, 'event', key);
      const r = award(hero.id, 'coins', s.coins!, 'event', key);
      return { awarded: r.awarded, duplicate: r.duplicate };
    },
    async senseiChallenge() {
      meAdult('sensei');
      const c = db.challenge && db.challenge.week === schoolWeek(now()) ? db.challenge : null;
      const houses = (db.houses ?? []).map((h) => {
        const mates = db.members.filter((m) => m.classId === h.classId);
        return { name: h.name, members: mates.length, progress: Math.round((mates.reduce((s, m) => s + Math.min(heroWeekPoints(m.childId), HOUSE_CAP), 0) / Math.max(mates.length, 1)) * 10) / 10 };
      }).filter((h) => h.members >= 1).sort((a, b) => b.progress - a.progress);
      return { theme: c?.theme ?? null, goal: c?.goal ?? null, coins: c?.coins ?? null, houses };
    },
    async senseiEvents() {
      meAdult('sensei');
      return liveEvents(schoolDate(now())).map((e) => ({ id: e.id, name: e.name, icon: e.icon, starts: e.starts, ends: e.ends, enabled: e.enabled, items: SHOP_ITEMS.filter((i) => i.event === e.id).length }));
    },
    async senseiSetEvent(id, starts, ends, enabled) {
      meAdult('sensei');
      if (!EVENTS.some((e) => e.id === id)) throw new Error('no such event');
      if (!(starts <= ends)) throw new Error('the end date must be after the start');
      if ((Date.parse(ends) - Date.parse(starts)) / 86400000 > 90) throw new Error('events last up to 90 days');
      (db.eventEdits ??= {})[id] = { starts, ends, enabled };
      commit();
    },
    async senseiSetChallenge(theme, goal, coins) {
      meAdult('sensei');
      const t = theme.trim().replace(/\s+/g, ' ');
      if (!/^[A-Za-z][A-Za-z ,.!'-]{2,39}$/.test(t)) throw new Error('theme needs 3 to 40 letters');
      if (!Number.isInteger(goal) || goal < 5 || goal > 80) throw new Error('goal is 5 to 80 points per hero');
      if (!Number.isInteger(coins) || coins < 5 || coins > 50) throw new Error('reward is 5 to 50 points');
      db.challenge = { week: schoolWeek(now()), theme: t, goal, coins };
      commit();
    },
    async houseVote(optionId) {
      const hero = meHero();
      const link = db.members.find((m) => m.childId === hero.id);
      const vote = link && (db.houseOptions ??= []).find((v) => v.classId === link.classId && v.open);
      if (!vote || !vote.options.some((o) => o.id === optionId)) throw new Error('that vote is not open');
      vote.votes[hero.id] = optionId;
      commit();
    },
    async leaderboard() {
      const hero = meHero();
      const link = db.members.find((m) => m.childId === hero.id);
      const mine = (db.houses ??= []).find((h) => h.classId === link?.classId);
      const myWeek = Math.min(heroWeekPoints(hero.id), HOUSE_CAP);
      const mySeason = Math.min(heroSeasonPoints(hero.id), HOUSE_CAP * 8);
      const houses = [
        ...DEMO_RIVALS.map((r) => ({ ...r, mine: false })),
        ...(mine ? [{ name: mine.name, color: mine.color, power: mine.power, motto: mine.motto, grade: hero.grade, members: db.members.filter((m) => m.classId === mine.classId).length, week: myWeek, season: mySeason, mine: true }] : []),
      ];
      const rk = (list: typeof houses, key: 'week' | 'season') => list.map((h) => 1 + list.filter((o) => o[key] > h[key]).length);
      const rw = rk(houses, 'week'), rs = rk(houses, 'season');
      const peers = [...DEMO_PEERS, { name: hero.displayName, starter: hero.starter, week: myWeek, season: mySeason, me: true }];
      const prk = (key: 'week' | 'season') => peers.map((h) => 1 + peers.filter((o) => o[key] > h[key]).length);
      const pw = prk('week'), ps = prk('season');
      return {
        minMembers: 1,
        houses: houses.map((h, i) => ({ ...h, rankWeek: rw[i], rankSeason: rs[i] })).sort((a, b) => a.rankSeason - b.rankSeason),
        heroes: peers.map((h, i) => ({ ...h, rankWeek: pw[i], rankSeason: ps[i] })).filter((h) => h.season > 0).sort((a, b) => a.rankSeason - b.rankSeason),
      };
    },
    async houseTeacherView(classId) {
      if (!teaches(classId)) throw new Error('not your class');
      const members = db.members.filter((m) => m.classId === classId).length;
      const house = (db.houses ??= []).find((h) => h.classId === classId);
      if (house) return { state: 'active', house };
      const vote = (db.houseOptions ??= []).find((v) => v.classId === classId && v.open);
      if (vote) {
        const ballots = Object.values(vote.votes);
        return { state: 'voting', members, voted: ballots.length, options: vote.options.map((o) => ({ ...o, votes: ballots.filter((b) => b === o.id).length })) };
      }
      return { state: 'none', members };
    },
    async houseProposeOptions(classId, options) {
      if (!teaches(classId)) throw new Error('not your class');
      if (options.length < 2 || options.length > 3) throw new Error('propose 2 or 3 Houses');
      if (new Set(options.map((o) => o.name.trim().toLowerCase())).size !== options.length) throw new Error('each House needs its own name');
      for (const o of options) if (!/^[A-Za-z][A-Za-z '-]{1,23}$/.test(o.name.trim())) throw new Error('house names are 2 to 24 letters');
      if ((db.houses ??= []).some((h) => h.classId === classId)) throw new Error('this class already has a House');
      db.houseOptions = (db.houseOptions ?? []).filter((v) => v.classId !== classId);
      db.houseOptions.push({ classId, open: true, votes: {}, options: options.map((o, i) => ({ ...o, name: o.name.trim(), motto: o.motto.trim(), id: i + 1 })) });
      commit();
    },
    async houseCloseVote(classId) {
      if (!teaches(classId)) throw new Error('not your class');
      const vote = (db.houseOptions ??= []).find((v) => v.classId === classId && v.open);
      const ballots = vote ? Object.values(vote.votes) : [];
      if (!vote || !ballots.length) throw new Error('wait for at least one vote');
      const win = [...vote.options].sort((a, b) => ballots.filter((x) => x === b.id).length - ballots.filter((x) => x === a.id).length || a.id - b.id)[0];
      (db.houses ??= []).push({ classId, name: win.name, color: win.color, power: win.power, motto: win.motto });
      vote.open = false;
      commit();
    },
    async currentRoom() {
      const me = meHero().id;
      const r = db.room;
      return r && (r.state === 'lobby' || r.state === 'playing') && r.players.some((p) => p.id === me) ? r.code : null;
    },
    async createRoom(game) {
      const me = meHero();
      if (!['trivia-clash', 'odin', 'shadow-signal', 'squad-drawing', 'escape-nexus', 'hide-seek'].includes(game)) throw new Error('unknown game');
      if (await this.currentRoom!()) throw new Error('leave your room first');
      const code = generateCode(4).replace(/[^A-Z]/g, 'K');
      db.room = { code, game, hostId: me.id, state: 'lobby', phase: 'question', idx: 0, phaseStart: at(), questions: [], players: [{ id: me.id, name: me.displayName, starter: me.starter, score: 0, bot: false, answers: {} }] };
      commit();
      return code;
    },
    async joinRoom(code) {
      const r = db.room;
      if (!r || r.code !== code.trim().toUpperCase() || r.state !== 'lobby') throw new Error('no room with that code');
      const me = meHero();
      if (r.players.some((p) => p.id === me.id)) return r.code;
      throw new Error('that room is for the other grade');
    },
    async leaveRoom() {
      const me = meHero().id;
      const r = db.room;
      if (!r || !r.players.some((p) => p.id === me)) return;
      db.room = null;
      commit();
    },
    async addPracticeBuddy() {
      const r = db.room;
      if (!r || r.state !== 'lobby') return;
      const n = r.players.filter((p) => p.bot).length;
      if (r.players.length >= ROOM_RULES.max) return;
      r.players.push({ id: `bot-${n}`, name: ['Bot Fox', 'Bot Owl', 'Bot Wolf', 'Bot Lynx', 'Bot Hawk'][n % 5], starter: 'ana', score: 0, bot: true, answers: {} });
      commit();
    },
    async startRoom() {
      const me = meHero();
      const r = db.room;
      if (!r || r.hostId !== me.id || r.state !== 'lobby') throw new Error('you are not hosting a room');
      if (r.players.length < ROOM_RULES.min) throw new Error('you need at least 2 players');
      if (r.game === 'hide-seek') {
        r.hide = newHideGame(r.players, at());
        r.state = 'playing'; r.phase = 'question'; r.idx = 0; r.phaseStart = at();
        commit();
        return;
      }
      if (r.game === 'escape-nexus') {
        const seals: Record<string, DemoSeal> = {};
        for (const p of r.players) {
          const seen = new Set(db.history.filter((h) => h.childId === p.id).map((h) => h.questionId));
          const pool = QUESTIONS.filter((q) => q.grade === me.grade && !seen.has(q.id)).sort(() => Math.random() - 0.5).slice(0, NEXUS.seals + NEXUS.spares);
          if (pool.length < NEXUS.seals) throw new Error('not enough fresh questions');
          if (!p.bot) for (const q of pool) db.history.push({ childId: p.id, questionId: q.id, servedAt: at() });
          seals[p.id] = { qids: pool.map((q) => q.id), pos: 0, solved: 0, need: NEXUS.seals, wrong: 0, hidden: [], boostUsed: false };
        }
        r.nexus = { startedAt: at(), base: NEXUS.base + r.players.length * NEXUS.perPlayer, penalty: 0, outcome: 'play', order: r.players.map((p) => p.id), seals };
        r.state = 'playing'; r.phase = 'question'; r.idx = 0; r.phaseStart = at();
        commit();
        return;
      }
      if (r.game === 'squad-drawing') {
        const order = r.players.map((p) => p.id).sort(() => Math.random() - 0.5);
        const word = DRAWING_WORDS[Math.floor(Math.random() * DRAWING_WORDS.length)];
        r.drawing = { order, round: 0, word, used: [word], phase: 'draw', phaseStart: at(), strokes: [], solved: {}, voided: false, guesses: [], plan: {}, reports: [], botSeed: 1 };
        drawingStartRound(r, r.drawing, at());
        r.state = 'playing'; r.phase = 'question'; r.idx = 0; r.phaseStart = at();
        commit();
        return;
      }
      if (r.game === 'shadow-signal') {
        if (r.players.length < 3) throw new Error('you need at least 3 players');
        const round = newRound(r.players.length);
        const order = r.players.map((p) => p.id).sort(() => Math.random() - 0.5);
        r.shadow = {
          category: round.category, word: round.word, options: round.options, shadowId: order[Math.floor(Math.random() * order.length)], order,
          phase: 'clue', turn: 0, phaseStart: at(), clues: [], votes: {}, caught: null, guess: null, shadowWon: null,
        };
        r.state = 'playing'; r.phase = 'question'; r.idx = 0; r.phaseStart = at();
        commit();
        return;
      }
      if (r.game === 'odin') {
        r.odin = deal(r.players.map((p) => p.id));
        r.odin.turnStart = at();
        r.state = 'playing'; r.phase = 'question'; r.idx = 0; r.phaseStart = at();
        commit();
        return;
      }
      const seen = new Set(db.history.filter((h) => h.childId === me.id).map((h) => h.questionId));
      const pool = QUESTIONS.filter((q) => q.grade === me.grade && !seen.has(q.id)).sort(() => Math.random() - 0.5).slice(0, ROOM_RULES.questions);
      if (pool.length < ROOM_RULES.questions) throw new Error('not enough fresh questions');
      r.questions = pool.map((q) => ({ id: q.id, seconds: q.prompt.includes('\n\n') ? ROOM_RULES.readingSeconds : ROOM_RULES.seconds }));
      for (const q of pool) db.history.push({ childId: me.id, questionId: q.id, servedAt: at() });
      r.state = 'playing'; r.phase = 'question'; r.idx = 0; r.phaseStart = at();
      commit();
    },
    async roomAnswer(choice) {
      const me = meHero().id;
      const r = db.room;
      if (!r || r.state !== 'playing') throw new Error('you are not in a game');
      demoRoomTick(r, at());
      if (r.state !== 'playing' || r.phase !== 'question') return;
      const player = r.players.find((p) => p.id === me)!;
      if (player.answers[r.idx]) return;
      const q = QUESTIONS.find((x) => x.id === r.questions[r.idx].id)!;
      const res = await this.answerQuestion(q.id, choice);
      const left = Math.max(0, 1 - (at() - r.phaseStart) / 1000 / r.questions[r.idx].seconds);
      const points = res.correct ? 100 + Math.floor(50 * left) : 0;
      player.answers[r.idx] = { choice, points };
      player.score += points;
      demoRoomTick(r, at());
      commit();
    },
    async roomState(code) {
      const me = meHero().id;
      const r = db.room;
      if (!r || r.code !== code.trim().toUpperCase() || !r.players.some((p) => p.id === me)) throw new Error('you are not in that room');
      demoRoomTick(r, at());
      commit();
      const out: RoomState = {
        code: r.code, game: r.game, state: r.state, phase: r.phase, idx: r.idx, total: r.questions.length, host: r.hostId === me,
        minPlayers: ROOM_RULES.min,
        players: [...r.players].sort((a, b) => b.score - a.score).map((p) => ({ name: p.name, starter: p.starter, score: p.score, me: p.id === me, host: p.id === r.hostId, answered: !!p.answers[r.idx] })),
      };
      if (r.state === 'playing' && r.game === 'trivia-clash') {
        const rq = r.questions[r.idx];
        const q = QUESTIONS.find((x) => x.id === rq.id)!;
        const wait = r.phase === 'question' ? rq.seconds : ROOM_RULES.revealSeconds;
        out.seconds = rq.seconds;
        out.secondsLeft = Math.max(0, Math.ceil(wait - (at() - r.phaseStart) / 1000));
        out.question = { prompt: q.prompt, choices: q.choices };
        out.myChoice = r.players.find((p) => p.id === me)!.answers[r.idx]?.choice ?? null;
        if (r.phase === 'reveal') {
          out.rightChoice = q.answer; out.explanation = q.explanation;
          out.myPoints = r.players.find((p) => p.id === me)!.answers[r.idx]?.points ?? 0;
        }
      }
      return out;
    },
    async odinView(code) {
      const me = meHero().id;
      const r = db.room;
      if (!r || r.game !== 'odin' || r.code !== code.trim().toUpperCase() || !r.players.some((p) => p.id === me)) throw new Error('you are not in that room');
      if (!r.odin) return { state: r.state, color: 'R', dir: 1, top: '', deck: 0, myTurn: false, secondsLeft: 0, hand: [], winner: null, players: [] };
      demoOdinTick(r, at());
      commit();
      const g = r.odin;
      const cur = g.order[g.turn];
      const botsWait = r.players.find((p) => p.id === cur)?.bot ? ODIN_BOT_MS : ODIN_TURN_MS;
      return {
        state: r.state, color: g.color, dir: g.dir, top: g.discard[g.discard.length - 1], deck: g.deck.length,
        myTurn: cur === me && r.state === 'playing', secondsLeft: Math.max(0, Math.ceil((g.turnStart + botsWait - at()) / 1000)),
        hand: [...g.hands[me]], winner: g.winner ? r.players.find((p) => p.id === g.winner)!.name : null,
        players: g.order.map((id) => {
          const p = r.players.find((x) => x.id === id)!;
          return { name: p.name, starter: p.starter, cards: g.hands[id].length, turn: id === cur && r.state === 'playing', me: id === me, left: false };
        }),
      };
    },
    async odinMove(card, color) {
      const me = meHero().id;
      const r = db.room;
      if (!r || r.game !== 'odin' || r.state !== 'playing' || !r.odin) throw new Error('you are not in a game');
      demoOdinTick(r, at());
      odinMoveRule(r.odin, me, card, color ?? null, at());
      if (r.odin.winner) r.state = 'done';
      demoOdinTick(r, at());
      commit();
    },
    async shadowView(code) {
      const me = meHero().id;
      const r = db.room;
      if (!r || r.game !== 'shadow-signal' || r.code !== code.trim().toUpperCase() || !r.players.some((p) => p.id === me)) throw new Error('you are not in that room');
      const sh = r.shadow;
      if (!sh) return { state: r.state, phase: 'clue', category: '', turn: 0, secondsLeft: 0, seconds: 0, isShadow: false, word: null, options: null, myVote: null, players: [], result: null };
      demoShadowTick(r, at());
      commit();
      const done = sh.phase === 'done';
      const myIdx = sh.order.indexOf(me);
      const seconds = sh.phase === 'done' ? 0 : SHADOW_SECONDS[sh.phase];
      const isShadow = sh.shadowId === me;
      const botTurn = sh.phase === 'clue' && r.players.find((p) => p.id === sh.order[sh.turn])?.bot;
      const wait = botTurn ? SHADOW_BOT_MS / 1000 : seconds;
      const votes = tallyVotes(sh.votes, sh.order.length);
      return {
        state: r.state, phase: sh.phase, category: sh.category, turn: sh.turn,
        secondsLeft: Math.max(0, Math.ceil(wait - (at() - sh.phaseStart) / 1000)), seconds,
        isShadow, word: !isShadow || done ? sh.word : null, options: isShadow && sh.phase === 'guess' ? sh.options : null,
        myVote: sh.votes[myIdx] ?? null,
        players: sh.order.map((id, i) => {
          const p = r.players.find((x) => x.id === id)!;
          return {
            i, name: p.name, starter: p.starter, me: id === me, left: false, speaking: sh.phase === 'clue' && i === sh.turn,
            clue: sh.clues.find((c) => c.i === i)?.text ?? null, voted: sh.votes[i] !== undefined,
            votes: done ? votes[i] : undefined, shadow: done ? id === sh.shadowId : undefined,
          };
        }),
        result: done ? { caught: !!sh.caught, shadowWon: !!sh.shadowWon, guess: sh.guess, word: sh.word } : null,
      };
    },
    async shadowClue(text) {
      const me = meHero().id;
      const sh = db.room?.shadow;
      const r = db.room;
      if (!r || !sh || r.state !== 'playing') throw new Error('you are not in a game');
      demoShadowTick(r, at());
      if (sh.phase !== 'clue' || sh.order[sh.turn] !== me) throw new Error('it is not your turn');
      const clue = text.trim().toLowerCase();
      if (!isSpyEmoji(clue)) {
        if (!/^[a-z][a-z'-]{0,15}$/.test(clue)) throw new Error('one word, letters only');
        if (chatFlagged(clue)) throw new Error('pick a different word');
        if (me !== sh.shadowId && clue.replace(/-/g, '').includes(sh.word.replace(/ /g, ''))) throw new Error('that gives it away');
      }
      sh.clues.push({ i: sh.turn, text: clue }); sh.turn += 1; sh.phaseStart = at();
      demoShadowTick(r, at());
      commit();
    },
    async shadowVote(index) {
      const me = meHero().id;
      const r = db.room;
      const sh = r?.shadow;
      if (!r || !sh || r.state !== 'playing') throw new Error('you are not in a game');
      demoShadowTick(r, at());
      const mine = sh.order.indexOf(me);
      if (sh.phase !== 'vote') throw new Error('it is not time to vote');
      if (!Number.isInteger(index) || index < 0 || index >= sh.order.length || index === mine) throw new Error('pick someone else');
      sh.votes[mine] = index;
      demoShadowTick(r, at());
      commit();
    },
    async shadowGuess(word) {
      const me = meHero().id;
      const r = db.room;
      const sh = r?.shadow;
      if (!r || !sh || r.state !== 'playing') throw new Error('you are not in a game');
      demoShadowTick(r, at());
      if (sh.phase !== 'guess' || sh.shadowId !== me) throw new Error('it is not time to guess');
      sh.guess = word;
      demoShadowFinish(r, sh, word.toLowerCase() === sh.word.toLowerCase(), at());
      commit();
    },
    async drawingView(code, since) {
      const me = meHero().id;
      const r = db.room;
      if (!r || r.game !== 'squad-drawing' || r.code !== code.trim().toUpperCase() || !r.players.some((p) => p.id === me)) throw new Error('you are not in that room');
      const d = r.drawing;
      if (!d) throw new Error('you are not in that room');
      demoDrawingTick(r, at());
      commit();
      const artist = d.order[d.round];
      const elapsed = (at() - d.phaseStart) / 1000;
      const know = artist === me || d.solved[me] !== undefined || d.phase === 'reveal' || r.state === 'done';
      const from = Math.min(Math.max(0, since), d.strokes.length);
      return {
        state: r.state, phase: d.phase, round: d.round, rounds: d.order.length,
        seconds: d.phase === 'draw' ? DRAWING_SECONDS : DRAWING_REVEAL,
        secondsLeft: Math.max(0, Math.ceil((d.phase === 'draw' ? DRAWING_SECONDS : DRAWING_REVEAL) - elapsed)),
        isArtist: artist === me, solved: d.solved[me] !== undefined, voided: d.voided,
        artist: r.players.find((p) => p.id === artist)!.name,
        word: know ? d.word : null, pattern: know ? null : maskWord(d.word, elapsed > DRAWING_SECONDS / 2),
        strokesFrom: from, strokes: d.strokes.slice(from),
        guesses: d.guesses.filter((g) => g.round === d.round).slice(-12).map((g) => ({ name: g.name, text: g.correct ? null : g.text, correct: g.correct, me: g.id === me })),
        players: [...r.players].sort((a, b) => b.score - a.score).map((p) => ({
          name: p.name, starter: p.starter, score: p.score, me: p.id === me, artist: p.id === artist && r.state === 'playing', solved: d.solved[p.id] !== undefined, left: false,
        })),
      };
    },
    async drawingStroke(id, color, width, points) {
      const me = meHero().id;
      const r = db.room;
      const d = r?.drawing;
      if (!r || !d || r.state !== 'playing') throw new Error('you are not in a game');
      demoDrawingTick(r, at());
      if (d.phase !== 'draw' || d.order[d.round] !== me) throw new Error('you are not drawing');
      if (!/^#[0-9a-f]{6}$/.test(color) || width < 1 || width > 24) throw new Error('bad pen');
      if (!points.length || points.length > 150 || points.some(([x, y]) => !(x >= 0 && x <= 1000 && y >= 0 && y <= 1000))) throw new Error('bad stroke');
      const last = d.strokes[d.strokes.length - 1];
      if (last && last.id === id) last.p.push(...points);
      else d.strokes.push({ id, c: color, w: width, p: [...points] });
      commit();
    },
    async drawingClear() {
      const me = meHero().id;
      const r = db.room;
      const d = r?.drawing;
      if (!r || !d || d.phase !== 'draw' || d.order[d.round] !== me) throw new Error('you are not drawing');
      d.strokes = [];
      commit();
    },
    async drawingGuess(text) {
      const me = meHero();
      const r = db.room;
      const d = r?.drawing;
      if (!r || !d || r.state !== 'playing') throw new Error('you are not in a game');
      demoDrawingTick(r, at());
      if (d.phase !== 'draw') throw new Error('the round is over');
      if (d.order[d.round] === me.id) throw new Error('you are drawing');
      if (d.solved[me.id] !== undefined) throw new Error('you already got it');
      const g = text.trim().toLowerCase().replace(/\s+/g, ' ');
      if (!/^[a-z ]{1,24}$/.test(g)) throw new Error('letters only');
      if (chatFlagged(g)) throw new Error('pick a different word');
      const mine = d.guesses.filter((x) => x.id === me.id).pop();
      if (mine && at() - mine.at < 1000) throw new Error('slow down');
      const ok = isRightGuess(g, d.word);
      let points = 0;
      if (ok) {
        points = 100 + Math.floor(50 * Math.max(0, 1 - (at() - d.phaseStart) / 1000 / DRAWING_SECONDS));
        d.solved[me.id] = points;
        r.players.find((p) => p.id === me.id)!.score += points;
      }
      d.guesses.push({ round: d.round, id: me.id, name: me.displayName, text: g, correct: ok, at: at() });
      demoDrawingTick(r, at());
      commit();
      return { correct: ok, points };
    },
    async drawingReport() {
      const me = meHero().id;
      const r = db.room;
      const d = r?.drawing;
      if (!r || !d || r.state !== 'playing') throw new Error('you are not in a game');
      const artist = d.order[d.round];
      if (artist === me) throw new Error('you are drawing');
      const reports = (db.drawingReports ??= []);
      if (!d.reports.includes(me)) {
        d.reports.push(me);
        reports.push({ artist: r.players.find((p) => p.id === artist)!.name, reporter: r.players.find((p) => p.id === me)!.name, word: d.word, at: new Date(at()).toISOString() });
      }
      const guessers = r.players.filter((p) => p.id !== artist).length;
      if (d.phase === 'draw' && d.reports.length >= Math.min(2, guessers)) { d.voided = true; d.strokes = []; demoDrawingTick(r, at()); }
      commit();
    },
    async senseiDrawingReports() {
      meAdult('sensei');
      return [...(db.drawingReports ?? [])].reverse().slice(0, 40);
    },
    async hideView(code) {
      const me = meHero().id;
      const r = db.room;
      if (!r || r.game !== 'hide-seek' || r.code !== code.trim().toUpperCase() || !r.players.some((p) => p.id === me) || !r.hide) throw new Error('you are not in that room');
      const g = r.hide;
      tickHide(g, at());
      if (g.phase === 'done') r.state = 'done';
      commit();
      const seeker = seekerOf(g);
      const secs = g.phase === 'hide' ? HIDE.hide : g.phase === 'seek' ? HIDE.seek : g.phase === 'reveal' ? HIDE.reveal : 0;
      const nameOf = (id: string) => r.players.find((p) => p.id === id)?.name ?? 'Hero';
      return {
        state: r.state, phase: g.phase, round: g.round, rounds: g.order.length,
        secondsLeft: Math.max(0, Math.ceil(secs - (at() - g.startedAt) / 1000)), secondsTotal: secs, layout: g.layout,
        seeker: seeker === me, searchesLeft: Math.max(0, HIDE.searches - g.searched.length), searched: g.searched,
        found: g.found.map((f) => ({ spot: f.spot, name: nameOf(f.id) })),
        mySpot: seeker === me ? null : g.spots[me] ?? null, meCaught: g.caught.includes(me),
        canSneak: seeker !== me && g.phase === 'seek' && !g.sneaked.includes(me) && !g.caught.includes(me),
        hiders: g.phase === 'reveal' || g.phase === 'done' ? Object.entries(g.spots).map(([id, spot]) => ({ name: nameOf(id), spot, caught: g.caught.includes(id) })) : null,
        players: g.order.map((id, i) => {
          const p = r.players.find((x) => x.id === id)!;
          return { i, name: p.name, starter: p.starter, me: id === me, score: g.scores[id] ?? 0, seeker: id === seeker && g.phase !== 'done', left: false };
        }),
      };
    },
    async hideMove(spot) {
      const me = meHero().id;
      const g = db.room?.hide;
      if (!db.room || !g || db.room.state !== 'playing') throw new Error('you are not in a game');
      tickHide(g, at());
      moveHide(g, me, spot);
      tickHide(g, at());
      commit();
    },
    async hideSearch(spot) {
      const me = meHero().id;
      const g = db.room?.hide;
      if (!db.room || !g || db.room.state !== 'playing') throw new Error('you are not in a game');
      tickHide(g, at());
      const found = searchHide(g, me, spot);
      tickHide(g, at());
      commit();
      return { found };
    },
    async nexusView(code) {
      const me = meHero().id;
      const r = db.room;
      if (!r || r.game !== 'escape-nexus' || r.code !== code.trim().toUpperCase() || !r.players.some((p) => p.id === me) || !r.nexus) throw new Error('you are not in that room');
      demoNexusTick(r, at());
      commit();
      const n = r.nexus;
      const mine = n.seals[me];
      const total = n.base + n.penalty;
      const q = mine.solved < mine.need && n.outcome === 'play' ? QUESTIONS.find((x) => x.id === mine.qids[mine.pos]) : undefined;
      return {
        state: r.state, outcome: n.outcome, secondsLeft: Math.max(0, Math.ceil(total - (at() - n.startedAt) / 1000)), secondsTotal: total, penalty: n.penalty,
        solved: mine.solved, need: mine.need, wrong: mine.wrong,
        question: q ? { prompt: q.prompt, choices: q.choices, hidden: mine.hidden } : null,
        canBoost: mine.solved >= mine.need && !mine.boostUsed && n.outcome === 'play',
        players: n.order.map((id, i) => {
          const p = r.players.find((x) => x.id === id)!;
          const s = n.seals[id];
          return { i, name: p.name, starter: p.starter, me: id === me, solved: s.solved, need: s.need, done: s.solved >= s.need, left: false };
        }),
      };
    },
    async nexusAnswer(choice) {
      const me = meHero().id;
      const r = db.room;
      const n = r?.nexus;
      if (!r || !n || r.state !== 'playing') throw new Error('you are not in a game');
      demoNexusTick(r, at());
      if (n.outcome !== 'play') return { correct: false, rightChoice: -1, explanation: '', penalty: 0, over: true };
      const seal = n.seals[me];
      if (seal.solved >= seal.need) throw new Error('your seal is already open');
      const res = await this.answerQuestion(seal.qids[seal.pos], choice);
      seal.pos += 1; seal.hidden = [];
      if (res.correct) seal.solved += 1; else { seal.wrong += 1; n.penalty += NEXUS.wrong; }
      if (seal.solved < seal.need && seal.pos >= seal.qids.length) { n.penalty += (seal.need - seal.solved) * NEXUS.exhausted; seal.solved = seal.need; }
      demoNexusTick(r, at());
      commit();
      return { correct: res.correct, rightChoice: res.rightChoice, explanation: res.explanation, penalty: res.correct ? 0 : NEXUS.wrong };
    },
    async nexusBoost(index) {
      const me = meHero().id;
      const r = db.room;
      const n = r?.nexus;
      if (!r || !n || r.state !== 'playing') throw new Error('you are not in a game');
      const mine = n.seals[me];
      if (mine.solved < mine.need) throw new Error('open your own seal first');
      if (mine.boostUsed) throw new Error('you already boosted someone');
      const target = n.order[index];
      const theirs = target && n.seals[target];
      if (!theirs || target === me || theirs.solved >= theirs.need) throw new Error('pick a teammate who still needs help');
      const q = QUESTIONS.find((x) => x.id === theirs.qids[theirs.pos]);
      if (q) {
        const options = q.choices.map((_, i) => i).filter((i) => i !== q.answer && !theirs.hidden.includes(i));
        if (options.length > 1) theirs.hidden.push(options[Math.floor(Math.random() * options.length)]);
      }
      mine.boostUsed = true;
      commit();
    },
    async chatSend(text) {
      const me = meHero();
      const r = db.room;
      if (!r || !r.players.some((p) => p.id === me.id)) throw new Error('join a room to chat');
      const chat = (db.chat ??= { messages: [], status: {} });
      const st = (chat.status[me.id] ??= { strikes: 0, banned: false, requested: false });
      const body = text.trim().replace(/\s+/g, ' ');
      if (!chatOpen(me.id)) return { ok: false, reason: 'no_class' };
      if (!body || body.length > 80) throw new Error('messages are 1 to 80 letters');
      if (st.banned) return { ok: false, reason: 'banned' };
      const mine = chat.messages.filter((m) => m.childId === me.id).pop();
      if (mine && at() - mine.at < 1000) return { ok: false, reason: 'slow' };
      if (/(https?:|www\.|\.com|\.net|\.org|@)/i.test(body) || /(\d\D*){6}/.test(body)) return { ok: false, reason: 'private' };
      if (chatFlagged(body)) {
        st.strikes += 1;
        st.banned = st.strikes >= 2;
        commit();
        return { ok: false, reason: st.banned ? 'banned' : 'warning' };
      }
      chat.messages.push({ id: chat.messages.length + 1, childId: me.id, name: me.displayName, body, at: at() });
      commit();
      return { ok: true };
    },
    async friendChatSend(friendId, text) {
      const me = meHero();
      if (!areFriends(me.id, friendId)) throw new Error('you can only chat with friends');
      const chat = (db.chat ??= { messages: [], status: {} });
      const st = (chat.status[me.id] ??= { strikes: 0, banned: false, requested: false });
      const body = text.trim().replace(/\s+/g, ' ');
      if (!body || body.length > 80) throw new Error('messages are 1 to 80 letters');
      if (st.banned) return { ok: false, reason: 'banned' };
      const list = (db.friendChat ??= []);
      const mine = list.filter((m) => m.from === me.id).pop();
      if (mine && at() - mine.at < 1000) return { ok: false, reason: 'slow' };
      if (/(https?:|www\.|\.com|\.net|\.org|@)/i.test(body) || /(\d\D*){6}/.test(body)) return { ok: false, reason: 'private' };
      if (chatFlagged(body)) {
        st.strikes += 1;
        st.banned = st.strikes >= 2;
        commit();
        return { ok: false, reason: st.banned ? 'banned' : 'warning' };
      }
      list.push({ id: list.length + 1, from: me.id, to: friendId, name: me.displayName, body, at: at() });
      commit();
      return { ok: true };
    },
    async friendChatRead(friendId) {
      const me = meHero().id;
      const ok = areFriends(me, friendId);
      const st = (db.chat ??= { messages: [], status: {} }).status[me];
      return {
        banned: !!st?.banned, canChat: ok,
        messages: !ok ? [] : (db.friendChat ??= []).filter((m) => (m.from === me && m.to === friendId) || (m.from === friendId && m.to === me)).slice(-30).map((m) => ({ id: m.id, name: m.name, me: m.from === me, body: m.body })),
      };
    },
    async chatRead() {
      const me = meHero().id;
      const chat = (db.chat ??= { messages: [], status: {} });
      return {
        banned: !!chat.status[me]?.banned,
        canChat: chatOpen(me),
        messages: !chatOpen(me) ? [] : chat.messages.slice(-25).map((m) => ({ id: m.id, name: m.name, me: m.childId === me, body: m.body })),
      };
    },
    async senseiChatLog() {
      meAdult('sensei');
      return (db.chat ??= { messages: [], status: {} }).messages.slice(-25).map((m) => ({ name: m.name, child: false, body: m.body, at: new Date(m.at).toISOString() }));
    },
    async childChat(childId) {
      if (!isParentOf(childId)) throw new Error('not your child');
      const st = (db.chat ??= { messages: [], status: {} }).status[childId];
      return { banned: !!st?.banned, requested: !!st?.banned && st.requested };
    },
    async chatRequestUnlock(childId) {
      if (!isParentOf(childId)) throw new Error('not your child');
      const st = (db.chat ??= { messages: [], status: {} }).status[childId];
      if (st?.banned) { st.requested = true; commit(); }
    },
    async senseiChatRequests() {
      meAdult('sensei');
      return Object.entries((db.chat ??= { messages: [], status: {} }).status).filter(([, st]) => st.banned).map(([id, st]) => {
        const h = heroById(id);
        return { childId: id, name: h?.displayName ?? 'Hero', grade: h?.grade ?? 5, requested: st.requested };
      });
    },
    async chatUnlock(childId) {
      meAdult('sensei');
      const st = (db.chat ??= { messages: [], status: {} }).status[childId];
      if (st?.banned) { st.banned = false; st.requested = false; st.strikes = 1; commit(); }
    },
    async senseiOverview() {
      meAdult('sensei');
      const heroes = Object.values(db.accounts);
      return {
        heroes: heroes.length,
        grade5: heroes.filter((h) => h.grade === 5).length,
        grade6: heroes.filter((h) => h.grade === 6).length,
        parents: db.adults.filter((a) => a.role === 'parent').length,
        teachers: db.adults.filter((a) => a.role === 'teacher' && a.approved).length,
        pendingTeachers: db.adults.filter((a) => a.role === 'teacher' && !a.approved).length,
        classes: db.classes.length,
        triviaNight: db.triviaNight,
      };
    },
    async ping(screen) {
      const hero = db.accounts && Object.values(db.accounts).find((a) => a.id === db.current);
      const adult = db.adults.find((a) => a.id === db.current);
      const who = hero ? { id: hero.id, role: 'hero' as const } : adult ? { id: adult.id, role: adult.role } : null;
      if (!who) return;
      const list = (db.pings ??= []);
      const clean = /^[a-z0-9:_-]{1,24}$/.test(screen) ? screen : 'other';
      const last = [...list].reverse().find((p) => p.userId === who.id);
      if (last && last.screen === clean && at() - last.at < 45_000) return;
      list.push({ userId: who.id, role: who.role, screen: clean, at: at() });
      if (list.length > 5000) list.splice(0, list.length - 5000);
      commit();
    },
    async senseiUsageReport() {
      meAdult('sensei');
      return { month: schoolDate(now()).slice(0, 7) + '-01', since: null, heroesTotal: Object.keys(db.accounts).length, activeKids: 0, hidden: db.hiddenGames ?? [], screens: [], weeks: [], hours: [], subjects: [] };
    },
    async hiddenGames() { return db.hiddenGames ?? []; },
    async senseiHideGame(id, hidden) {
      meAdult('sensei');
      const list = new Set(db.hiddenGames ?? []);
      if (hidden) list.add(id); else list.delete(id);
      db.hiddenGames = [...list];
      commit();
    },
    async senseiTraffic() {
      meAdult('sensei');
      const list = (db.pings ??= []);
      const nowMs = at();
      const today = schoolDate(now());
      const dayOf = (ms: number) => schoolDate(new Date(ms));
      const hourOf = (ms: number) => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(new Date(ms)));
      const heroPings = list.filter((p) => p.role === 'hero');
      const latest = new Map<string, (typeof list)[number]>();
      for (const p of list) if (p.role !== 'sensei') latest.set(p.userId, p);
      const recent = [...latest.values()].filter((p) => nowMs - p.at < 5 * 60_000);
      const uniq = (rows: typeof list) => new Set(rows.map((p) => p.userId)).size;
      const since = (n: number) => heroPings.filter((p) => nowMs - p.at < n * DAY);
      const days = Array.from({ length: 14 }, (_, i) => {
        const day = dayOf(nowMs - (13 - i) * DAY);
        const rows = list.filter((p) => dayOf(p.at) === day);
        return {
          day,
          heroes: uniq(rows.filter((p) => p.role === 'hero')),
          adults: uniq(rows.filter((p) => p.role === 'parent' || p.role === 'teacher')),
          minutes: rows.filter((p) => p.role === 'hero').length,
          newHeroes: 0,
        };
      });
      const todayRows = heroPings.filter((p) => dayOf(p.at) === today);
      const screens = new Map<string, number>();
      const activeHeroes = recent.filter((p) => p.role === 'hero');
      for (const p of activeHeroes) screens.set(p.screen, (screens.get(p.screen) ?? 0) + 1);
      return {
        totalHeroes: Object.keys(db.accounts).length,
        nowHeroes: activeHeroes.length,
        nowAdults: recent.filter((p) => p.role === 'parent' || p.role === 'teacher').length,
        todayHeroes: uniq(todayRows),
        weekHeroes: uniq(since(7)),
        monthHeroes: uniq(since(30)),
        active: activeHeroes.sort((a, b) => b.at - a.at).slice(0, 40).map((p) => {
          const h = heroById(p.userId);
          return { name: h?.displayName ?? 'Hero', grade: h?.grade ?? 5, screen: p.screen, secondsAgo: Math.round((nowMs - p.at) / 1000) };
        }),
        days,
        hours: Array.from({ length: 24 }, (_, hour) => ({ hour, heroes: uniq(todayRows.filter((p) => hourOf(p.at) === hour)) })),
        screens: [...screens].map(([screen, count]) => ({ screen, count })).sort((a, b) => b.count - a.count),
      };
    },
    async pendingTeachers() {
      meAdult('sensei');
      return db.adults.filter((a) => a.role === 'teacher' && !a.approved).map((a) => ({ id: a.id, displayName: a.displayName, email: a.email }));
    },
    async approveTeacher(id, approve) {
      meAdult('sensei');
      const a = db.adults.find((x) => x.id === id && x.role === 'teacher');
      if (!a) return;
      if (approve) a.approved = true;
      else if (!a.approved) db.adults = db.adults.filter((x) => x.id !== id);
      commit();
    },
    async teacherCharacter() {
      const a = meAdult('teacher');
      return { ...(db.teacherCharacters?.[a.id] ?? { status: 'none', wish: '', photo: null, art: null, artNote: '', changeNote: '' }) } as TeacherCharacter;
    },
    async teacherCharacterWish(wish) {
      const a = meAdult('teacher');
      const all = (db.teacherCharacters ??= {});
      all[a.id] = { ...(all[a.id] ?? { status: 'wish', photo: null, art: null, artNote: '', changeNote: '' }), wish: wish.trim().slice(0, 600) };
      commit();
    },
    async teacherCharacterSubmit(photo, wish) {
      const a = meAdult('teacher');
      const all = (db.teacherCharacters ??= {});
      if (!photo.startsWith('data:image/')) throw new Error('that photo does not work, try a smaller one');
      if (all[a.id]?.status === 'review') throw new Error('approve or ask for changes on the character first');
      all[a.id] = { ...(all[a.id] ?? { art: null, artNote: '' }), status: 'new', wish: wish.trim().slice(0, 600), photo, changeNote: '' } as TeacherCharacter;
      commit();
    },
    async teacherCharacterRespond(approve, note) {
      const a = meAdult('teacher');
      const c = db.teacherCharacters?.[a.id];
      if (!c || c.status !== 'review') throw new Error('there is no character waiting for you');
      c.status = approve ? 'approved' : 'changes';
      c.changeNote = approve ? '' : note.trim().slice(0, 300);
      commit();
    },
    async teacherCharacterRemovePhoto() {
      const a = meAdult('teacher');
      const c = db.teacherCharacters?.[a.id];
      if (!c || !c.photo || c.status === 'new') throw new Error('there is no photo to remove right now');
      c.photo = null;
      commit();
    },
    async senseiCharacterQueue() {
      meAdult('sensei');
      return Object.entries(db.teacherCharacters ?? {})
        .filter(([, c]) => c.status === 'new' || c.status === 'changes')
        .map(([id, c]) => ({ teacherId: id, name: db.adults.find((x) => x.id === id)?.displayName ?? 'Teacher', status: c.status as 'new' | 'changes', wish: c.wish, photo: c.photo, changeNote: c.changeNote }));
    },
    async senseiCharacterDeliver(teacherId, art, note) {
      meAdult('sensei');
      const c = db.teacherCharacters?.[teacherId];
      if (!c || (c.status !== 'new' && c.status !== 'changes')) throw new Error('that request is not waiting for art');
      if (!art.startsWith('data:image/')) throw new Error('that image does not work, try a smaller one');
      c.art = art; c.artNote = note.trim().slice(0, 300); c.status = 'review';
      commit();
    },
    async aiStatus() {
      meAdult('teacher');
      return { configured: false, limit: 10, left: 10 };
    },
    async aiDraftQuiz() {
      meAdult('teacher');
      throw new Error('not_set_up');
    },
    async senseiDeleteAnnouncement(id) {
      meAdult('sensei');
      const a = db.announcements.find((x) => x.id === id && !(x as { deleted?: boolean }).deleted);
      if (!a) throw new Error('no such announcement');
      (a as { deleted?: boolean }).deleted = true;
      commit();
    },
    async postAnnouncement(title, body) {
      meAdult('sensei');
      if (!title.trim() || !body.trim()) throw new Error('write a title and a message');
      db.announcements.push({ id: Math.max(0, ...db.announcements.map((a) => a.id)) + 1, title: title.trim().slice(0, 80), body: body.trim().slice(0, 500), createdAt: now().toISOString() });
      commit();
    },
    async triviaState() {
      return triviaFor(meHero());
    },
    async triviaRsvp(going) {
      const hero = meHero();
      const date = nextTriviaDate();
      const rows = (db.trivia ??= []);
      const row = rows.find((r) => r.date === date && r.heroId === hero.id);
      if (row) row.going = going; else rows.push({ date, heroId: hero.id, going });
      commit();
      return triviaFor(hero);
    },
    async senseiTriviaRoster() {
      meAdult('sensei');
      const date = nextTriviaDate();
      const grades = [5, 6].map((grade) => {
        const names = (db.trivia ?? []).filter((r) => r.date === date && r.going)
          .map((r) => Object.values(db.accounts).find((a) => a.id === r.heroId)).filter((a) => a?.grade === grade)
          .map((a) => a!.displayName).sort();
        return { grade, going: names.length, names };
      }).filter((g) => g.going > 0);
      return { date, time: db.triviaNight.time, grades };
    },
    async senseiTriviaPrize(coins) {
      meAdult('sensei');
      if (!Number.isInteger(coins) || coins < 1 || coins > 100) throw new Error('pick 1 to 100 points');
      const date = schoolDate(now());
      let n = 0;
      for (const r of (db.trivia ?? []).filter((x) => x.date === date && x.going)) {
        if (!award(r.heroId, 'coins', coins, 'event', `trivia:${date}`).duplicate) n++;
      }
      return n;
    },
    async setTriviaNight(weekday, time) {
      meAdult('sensei');
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('trivia night needs a time like 18:30');
      db.triviaNight = { weekday, time };
      commit();
    },
  };
  return backend;
}
