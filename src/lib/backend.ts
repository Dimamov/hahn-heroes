import type { Currency } from '../../supabase/functions/_shared/rewards.ts';

export interface Hero {
  id: string;
  heroCode: string;
  displayName: string;
  grade: 5 | 6;
  starter: string;
}

export interface SignUpInput {
  grade: 5 | 6;
  hero: string;
  nameAdjective: string;
  nameNoun: string;
  picture: number[];
}

export type AdultRole = 'parent' | 'teacher' | 'sensei';
export interface Adult {
  id: string;
  role: AdultRole;
  displayName: string;
  approved: boolean;
}

/** Who is signed in on this device: a hero, a grown-up, or nobody. */
export type Identity = { kind: 'hero'; hero: Hero } | { kind: 'adult'; adult: Adult } | null;

export type Balances = Record<Currency, number>;

export class SignInError extends Error {
  constructor(
    public kind: 'wrong' | 'resting' | 'network',
    public detail?: { triesLeft?: number; retryAfter?: number },
  ) {
    super(kind);
  }
}

export class AdultAuthError extends Error {
  constructor(public kind: 'wrong' | 'taken' | 'weak' | 'network') {
    super(kind);
  }
}

// ---- Missions ------------------------------------------------------------------------------

export type HomeMissionStatus = 'assigned' | 'submitted' | 'approved' | 'sent_back';
export interface HomeMission {
  id: string;
  childId: string;
  title: string;
  details: string;
  coins: number;
  status: HomeMissionStatus;
}

export interface ClassInfo {
  id: string;
  name: string;
  grade: 5 | 6;
  /** Only teachers see the join code. */
  joinCode?: string;
  members?: number;
}

export interface QuizQuestion {
  prompt: string;
  choices: string[];
}
export interface ClassResult {
  correct: number;
  total: number;
  scorePct: number;
  coins: number;
  passed: boolean;
  alreadyDone?: boolean;
  /** Shown right after answering, so a wrong answer teaches something. */
  review?: { correct: boolean; rightChoice: number; explanation: string }[];
}
export interface ClassMission {
  id: string;
  title: string;
  passage: string;
  questions: QuizQuestion[];
  maxCoins: number;
  /** Set once this student has taken it. */
  result?: ClassResult;
}
export interface NewClassMission {
  title: string;
  passage: string;
  questions: QuizQuestion[];
  answers: number[];
  explanations: string[];
  maxCoins: number;
}
export interface ClassMissionResults {
  id: string;
  title: string;
  submissions: { childId: string; childName: string; scorePct: number; coins: number }[];
}

export type JoinClassResult =
  | { ok: true; name: string }
  | { ok: false; error: 'invalid_code' | 'wrong_grade' | 'already_in_class' | 'too_many_tries' };

export interface Announcement {
  id: number;
  title: string;
  body: string;
  createdAt: string;
}

export interface ChildSummary {
  id: string;
  displayName: string;
  grade: 5 | 6;
  starter: string;
  waiting: number;
}
export interface ChildProgress {
  coins: number;
  xp: number;
  homeWeek: number;
  classWeek: number;
  homeCap: number;
  classCap: number;
}
export type LinkResult =
  | { ok: true; childName: string }
  | { ok: false; error: 'invalid_code' | 'too_many_tries' };

export interface SenseiOverview {
  heroes: number;
  grade5: number;
  grade6: number;
  parents: number;
  teachers: number;
  pendingTeachers: number;
  classes: number;
  triviaNight: { weekday: string; time: string };
}
export interface TrafficDay { day: string; heroes: number; adults: number; minutes: number; newHeroes: number }
export interface ActivePlayer { name: string; grade: number; screen: string; secondsAgo: number }
export interface SenseiTraffic {
  totalHeroes: number;
  nowHeroes: number;
  nowAdults: number;
  todayHeroes: number;
  weekHeroes: number;
  monthHeroes: number;
  active: ActivePlayer[];
  days: TrafficDay[];
  hours: { hour: number; heroes: number }[];
  screens: { screen: string; count: number }[];
}
export interface Friend { id: string; heroId: string; name: string; grade: number; starter: string }
export interface FriendRequest { id: string; name: string; grade: number; starter: string }
export interface Friends { friends: Friend[]; incoming: FriendRequest[]; outgoing: { id: string; name: string }[] }
export interface SquadMember { heroId: string; name: string; starter: string; status: 'member' | 'invited'; isLeader: boolean }
export interface SquadView {
  squad: { id: string; name: string; leader: boolean; members: SquadMember[] } | null;
  invites: { squadId: string; name: string; leaderName: string }[];
}
export const SQUAD_WORDS = {
  adjectives: ['Brave', 'Swift', 'Bright', 'Bold', 'Kind', 'Wild', 'Clever', 'Mighty', 'Lucky', 'Cosmic'],
  nouns: ['Wolves', 'Comets', 'Owls', 'Foxes', 'Falcons', 'Dragons', 'Stars', 'Lions', 'Sparks', 'Titans'],
  maxMembers: 5,
};
export interface RoomPlayer { name: string; starter: string; score: number; me: boolean; host: boolean; answered: boolean }
export interface RoomState {
  code: string;
  game: string;
  state: 'lobby' | 'playing' | 'done' | 'closed';
  phase: 'question' | 'reveal';
  idx: number;
  total: number;
  host: boolean;
  minPlayers: number;
  players: RoomPlayer[];
  seconds?: number;
  secondsLeft?: number;
  question?: { prompt: string; choices: string[] };
  myChoice?: number | null;
  rightChoice?: number;
  explanation?: string;
  myPoints?: number;
}
export interface OdinPlayer { name: string; starter: string; cards: number; turn: boolean; me: boolean; left: boolean }
export interface OdinView {
  state: 'lobby' | 'playing' | 'done' | 'closed';
  color: 'R' | 'B' | 'G' | 'Y';
  dir: 1 | -1;
  top: string;
  deck: number;
  myTurn: boolean;
  secondsLeft: number;
  hand: string[];
  winner: string | null;
  players: OdinPlayer[];
}
export interface ShadowPlayer { i: number; name: string; starter: string; me: boolean; left: boolean; speaking: boolean; clue: string | null; voted: boolean; votes?: number; shadow?: boolean }
export interface ShadowView {
  state: 'lobby' | 'playing' | 'done' | 'closed';
  phase: 'clue' | 'vote' | 'guess' | 'done';
  category: string;
  turn: number;
  secondsLeft: number;
  seconds: number;
  isShadow: boolean;
  /** The secret word: hidden from the Shadow until the game ends. */
  word: string | null;
  /** Words the Shadow can pick from when guessing. */
  options: string[] | null;
  myVote: number | null;
  players: ShadowPlayer[];
  result: { caught: boolean; shadowWon: boolean; guess: string | null; word: string } | null;
}
export interface ChatMessage { id: number; name: string; me: boolean; body: string }
export type ChatResult = { ok: true } | { ok: false; reason: 'warning' | 'banned' | 'slow' | 'private' };
export interface ChatChild { banned: boolean; requested: boolean }
export interface ChatRequest { childId: string; name: string; grade: number; requested: boolean }
export interface ArcadeStatus { coins: number; games: string[]; claimed: string[] }
export interface PendingTeacher {
  id: string;
  displayName: string;
  email: string;
}

// ---- Learning ------------------------------------------------------------------------------

export const SUBJECTS = ['math', 'vocab', 'reading', 'science'] as const;
export type Subject = (typeof SUBJECTS)[number];
export interface PracticeQuestion {
  id: string;
  subject: Subject;
  skill: string;
  prompt: string;
  choices: string[];
}
export interface PracticeSet {
  questions: PracticeQuestion[];
  /** Unseen questions still waiting after this set. */
  remaining: number;
}
export interface AnswerResult {
  correct: boolean;
  rightChoice: number;
  explanation: string;
  /** True when this question was already answered; nothing more is paid. */
  repeat: boolean;
  awarded?: { coins: number; xp: number; skillPoints: number; capped: boolean };
}
export interface SubjectProgress {
  subject: Subject;
  answered: number;
  correct: number;
  left: number;
  skills: { skill: string; attempts: number; correct: number }[];
}

/** Everything the app needs from a server. The demo and Supabase versions behave the same. */
export interface Backend {
  mode: 'demo' | 'supabase';
  restore(): Promise<Identity>;
  signOut(): Promise<void>;

  // Heroes
  signUp(input: SignUpInput): Promise<Hero>;
  signIn(heroCode: string, picture: number[]): Promise<Hero>;
  balances(): Promise<Balances>;
  dailyStatus(): Promise<{ available: boolean; amount: number }>;
  claimDaily(): Promise<{ awarded: number; duplicate: boolean }>;
  linkCode(): Promise<{ code: string; expiresAt: string }>;
  homeMissions(): Promise<HomeMission[]>;
  submitHomeMission(id: string): Promise<void>;
  myClass(): Promise<ClassInfo | null>;
  joinClass(code: string): Promise<JoinClassResult>;
  classMissions(): Promise<ClassMission[]>;
  submitClassMission(id: string, answers: number[]): Promise<ClassResult>;
  announcements(): Promise<{ items: Announcement[]; unread: number }>;
  markAnnouncementsRead(): Promise<void>;

  startPractice(subject: Subject): Promise<PracticeSet>;
  answerQuestion(questionId: string, choice: number): Promise<AnswerResult>;
  learning(): Promise<SubjectProgress[]>;

  // Grown-ups
  adultSignUp(email: string, password: string, role: 'parent' | 'teacher', name: string): Promise<Adult | 'confirm_email'>;
  adultSignIn(email: string, password: string): Promise<Adult>;
  /** Emails a password-reset link. Always resolves, so it never reveals who has an account. */
  adultRequestReset(email: string): Promise<void>;
  /** True when the app was opened from a password-reset link and needs a new password. */
  resetPending(): boolean;
  adultSetPassword(password: string): Promise<void>;
  claimLink(code: string): Promise<LinkResult>;
  children(): Promise<ChildSummary[]>;
  childMissions(childId: string): Promise<HomeMission[]>;
  childProgress(childId: string): Promise<ChildProgress>;
  childLearning(childId: string): Promise<SubjectProgress[]>;
  createHomeMission(childId: string, title: string, details: string, coins: number): Promise<void>;
  reviewHomeMission(id: string, approve: boolean): Promise<{ status: string; awarded: number; capped?: boolean }>;
  classes(): Promise<ClassInfo[]>;
  createClass(name: string, grade: 5 | 6): Promise<ClassInfo>;
  createClassMission(classId: string, mission: NewClassMission): Promise<void>;
  classResults(classId: string): Promise<ClassMissionResults[]>;
  resetSubmission(missionId: string, childId: string): Promise<void>;
  /** Which reward games are open today and which ones this hero already collected. */
  arcadeStatus(): Promise<ArcadeStatus>;
  /** Pays the daily reward for a finished game, once per game per school day. */
  arcadeClaim(game: string): Promise<{ awarded: number; duplicate: boolean; capped: boolean }>;
  friends(): Promise<Friends>;
  /** Ask another hero to be friends using their hero code. Resolves with their name. */
  requestFriend(code: string): Promise<string>;
  respondFriend(id: string, accept: boolean): Promise<void>;
  removeFriend(id: string): Promise<void>;
  mySquad(): Promise<SquadView>;
  createSquad(adjective: string, noun: string): Promise<void>;
  inviteToSquad(friendHeroId: string): Promise<void>;
  respondSquadInvite(squadId: string, accept: boolean): Promise<void>;
  leaveSquad(): Promise<void>;
  /** The code of the room this hero is in right now, so a reconnect can rejoin it. */
  currentRoom(): Promise<string | null>;
  createRoom(game: string): Promise<string>;
  joinRoom(code: string): Promise<string>;
  leaveRoom(): Promise<void>;
  startRoom(): Promise<void>;
  roomAnswer(choice: number): Promise<void>;
  roomState(code: string): Promise<RoomState>;
  /** ODIN: what this hero can see. Passing the room code also nudges a stalled turn along. */
  odinView(code: string): Promise<OdinView>;
  /** ODIN: play a card (with a colour for wilds), or pass null to draw one card and end the turn. */
  odinMove(card: string | null, color?: string): Promise<void>;
  shadowView(code: string): Promise<ShadowView>;
  shadowClue(text: string): Promise<void>;
  shadowVote(index: number): Promise<void>;
  shadowGuess(word: string): Promise<void>;
  chatSend(text: string): Promise<ChatResult>;
  chatRead(): Promise<{ banned: boolean; messages: ChatMessage[] }>;
  childChat(childId: string): Promise<ChatChild>;
  chatRequestUnlock(childId: string): Promise<void>;
  senseiChatRequests(): Promise<ChatRequest[]>;
  chatUnlock(childId: string): Promise<void>;
  /** Demo mode only: adds a practice buddy so a game can start without a second device. */
  addPracticeBuddy?(): Promise<void>;
  senseiOverview(): Promise<SenseiOverview>;
  /** Tells the Sensei this person is here. Safe to call often; the server throttles it. */
  ping(screen: string): Promise<void>;
  senseiTraffic(): Promise<SenseiTraffic>;
  pendingTeachers(): Promise<PendingTeacher[]>;
  approveTeacher(id: string, approve: boolean): Promise<void>;
  postAnnouncement(title: string, body: string): Promise<void>;
  setTriviaNight(weekday: string, time: string): Promise<void>;
}

export const emptyBalances = (): Balances => ({ coins: 0, xp: 0, skill_points: 0, nexling_growth: 0, house_score: 0 });
