// Demo mode: the same rules as the server, saved only on this device. Lets the app run
// before a Supabase project is connected. Nothing here is secure; it is for trying the app.
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
import { CARDS, cardById, fairness as tradeFairness, type OfferItem, type Rarity } from './cards.ts';
import { SKILLS, dailyBonus, growthMultipliers, surgeRules } from './skills.ts';
import { NEXLING_STAGES, nexlingType } from './nexlings.ts';
import bank from '../../content/questions.json';
import {
  AdultAuthError, HOUSE_COLORS, SQUAD_WORDS, SUBJECTS, SignInError, emptyBalances,
  type Adult, type Announcement, type Backend, type ClassInfo, type ClassMission, type ClassMissionResults,
  type ClassResult, type Hero, type HouseIdentity, type HomeMission, type HomeMissionStatus, type Identity, type NewClassMission,
  type QuizQuestion, type RoomState, type SignUpInput, type Subject, type SubjectProgress,
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
function chatFlagged(text: string): boolean {
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
  reads: { userId: string; announcementId: number }[];
  triviaNight: { weekday: string; time: string };
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
  chat?: { messages: { id: number; childId: string; name: string; body: string; at: number }[]; status: Record<string, { strikes: number; banned: boolean; requested: boolean }> };
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
  const areFriends = (x: string, y: string) => (db.friendships ??= []).some((f) => f.status === 'accepted' && ((f.a === x && f.b === y) || (f.a === y && f.b === x)));
  const tradeFor = (id: string) => {
    const me = meHero().id;
    const t = (db.trades ??= []).find((x) => x.id === id);
    if (!t || (t.a !== me && t.b !== me)) throw new Error('not your trade');
    return { t, me, mine: t.a === me };
  };
  const tradeFair = (t: NonNullable<Db['trades']>[number]) => tradeFairness(t.offerA, t.offerB, (c) => qtyOf(t.a, c) > 0, (c) => qtyOf(t.b, c) > 0);
  const skillBalance = (heroId: string) => db.ledger.filter((l) => l.heroId === heroId && l.currency === 'skill_points').reduce((s, l) => s + l.amount, 0);
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
    db.ledger.push({ heroId, currency, amount: grant, source, key, week });
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
        id: crypto.randomUUID(), heroCode: code, displayName: name, grade: input.grade, starter: input.hero,
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
      const items = [...db.announcements].sort((a, b) => b.id - a.id);
      const unread = items.filter((a) => !db.reads.some((r) => r.userId === userId && r.announcementId === a.id)).length;
      return { items, unread };
    },
    async markAnnouncementsRead() {
      const userId = db.current ?? '';
      for (const a of db.announcements) {
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
      if (!isParentOf(childId)) throw new Error('not your child');
      return learningFor(childId);
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
      const other = db.accounts[normalizeHeroCode(code)];
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
      return {
        coins: bal.coins, xp: bal.xp,
        items: SHOP_ITEMS.map((i) => ({ id: i.id, kind: i.kind, slot: i.slot, name: i.name, icon: i.icon, price: i.price, unlockXp: i.unlock_xp, owned: owned.has(i.id), locked: i.unlock_xp > bal.xp }))
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
      if (!['trivia-clash', 'odin', 'shadow-signal', 'squad-drawing', 'escape-nexus'].includes(game)) throw new Error('unknown game');
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
      if (!/^[a-z][a-z'-]{0,15}$/.test(clue)) throw new Error('one word, letters only');
      if (chatFlagged(clue)) throw new Error('pick a different word');
      if (me !== sh.shadowId && clue.replace(/-/g, '').includes(sh.word.replace(/ /g, ''))) throw new Error('that gives it away');
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
    async chatRead() {
      const me = meHero().id;
      const chat = (db.chat ??= { messages: [], status: {} });
      return {
        banned: !!chat.status[me]?.banned,
        messages: chat.messages.slice(-25).map((m) => ({ id: m.id, name: m.name, me: m.childId === me, body: m.body })),
      };
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
    async postAnnouncement(title, body) {
      meAdult('sensei');
      if (!title.trim() || !body.trim()) throw new Error('write a title and a message');
      db.announcements.push({ id: db.announcements.length + 1, title: title.trim().slice(0, 80), body: body.trim().slice(0, 500), createdAt: now().toISOString() });
      commit();
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
