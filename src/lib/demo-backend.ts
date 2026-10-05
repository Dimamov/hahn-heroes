// Demo mode: the same rules as the server, saved only on this device. Lets the app run
// before a Supabase project is connected. Nothing here is secure; it is for trying the app.
import {
  ARCADE_REWARDS, CLASS_PASS_PERCENT, DAILY_LOGIN_COINS, LEARNING_REWARDS, WEEKLY_CAPS, classMissionCoins, schoolDate, schoolWeek,
  type Currency, type RewardSource,
} from '../../supabase/functions/_shared/rewards.ts';
import {
  LOCKOUT_MINUTES, MAX_FAILED_TRIES, generateCode, generateHeroCode, heroDisplayName, isGrade, isStarterHero,
  isValidPicture, normalizeHeroCode,
} from '../../supabase/functions/_shared/kid-auth.ts';
import bank from '../../content/questions.json';
import {
  AdultAuthError, SQUAD_WORDS, SUBJECTS, SignInError, emptyBalances,
  type Adult, type Announcement, type Backend, type ClassInfo, type ClassMission, type ClassMissionResults,
  type ClassResult, type Hero, type HomeMission, type HomeMissionStatus, type Identity, type NewClassMission,
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
interface DemoRoom {
  code: string;
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
  room?: DemoRoom | null;
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

/** Moves a demo room along: practice buddies answer on their own, then the question closes and the next one opens. */
function demoRoomTick(r: DemoRoom, now = Date.now()) {
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
      if (raw) return JSON.parse(raw) as Db;
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
      return { available: !taken, amount: DAILY_LOGIN_COINS };
    },
    async claimDaily() {
      const r = award(meHero().id, 'coins', DAILY_LOGIN_COINS, 'daily', dailyKey());
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
      if (right) {
        const key = `learn:${questionId}`;
        const coins = award(hero.id, 'coins', LEARNING_REWARDS.coins, 'learning', key);
        award(hero.id, 'xp', LEARNING_REWARDS.xp, 'learning', key);
        award(hero.id, 'skill_points', LEARNING_REWARDS.skillPoints, 'learning', key);
        awarded = { coins: coins.awarded, xp: LEARNING_REWARDS.xp, skillPoints: LEARNING_REWARDS.skillPoints, capped: coins.capped };
      }
      commit();
      return { correct: right, rightChoice: q.answer, explanation: q.explanation, repeat: false, awarded };
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
    async currentRoom() {
      const me = meHero().id;
      const r = db.room;
      return r && (r.state === 'lobby' || r.state === 'playing') && r.players.some((p) => p.id === me) ? r.code : null;
    },
    async createRoom(game) {
      const me = meHero();
      if (game !== 'trivia-clash') throw new Error('unknown game');
      if (await this.currentRoom!()) throw new Error('leave your room first');
      const code = generateCode(4).replace(/[^A-Z]/g, 'K');
      db.room = { code, hostId: me.id, state: 'lobby', phase: 'question', idx: 0, phaseStart: at(), questions: [], players: [{ id: me.id, name: me.displayName, starter: me.starter, score: 0, bot: false, answers: {} }] };
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
      r.players.push({ id: `bot-${n}`, name: ['Bot Fox', 'Bot Owl', 'Bot Wolf'][n % 3], starter: 'ana', score: 0, bot: true, answers: {} });
      commit();
    },
    async startRoom() {
      const me = meHero();
      const r = db.room;
      if (!r || r.hostId !== me.id || r.state !== 'lobby') throw new Error('you are not hosting a room');
      if (r.players.length < ROOM_RULES.min) throw new Error('you need at least 2 players');
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
        code: r.code, game: 'trivia-clash', state: r.state, phase: r.phase, idx: r.idx, total: r.questions.length, host: r.hostId === me,
        minPlayers: ROOM_RULES.min,
        players: [...r.players].sort((a, b) => b.score - a.score).map((p) => ({ name: p.name, starter: p.starter, score: p.score, me: p.id === me, host: p.id === r.hostId, answered: !!p.answers[r.idx] })),
      };
      if (r.state === 'playing') {
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
