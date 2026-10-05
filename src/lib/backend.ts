import type { DrawStroke } from './drawing-rules.ts';
import type { Currency } from '../../supabase/functions/_shared/rewards.ts';
import type { ShowcaseState } from './showcase.ts';
import type { StickerBook, StickerDesign } from './stickers.ts';
import type { Comic, ComicPanels } from './comics.ts';
import type { ContestState } from './contest.ts';
import type { MadeCode, RedeemResult } from './codes.ts';
import type { TreasureState } from './treasure.ts';
import type { RaceState } from './race.ts';
import type { GalleryLook, Look, LookState } from './look.ts';
import type { AdvAnswerResult, AdvDone, AdvProgress } from './adventures.ts';
import type { StoryAnswerResult, StoryChoiceResult, StoryDone, StoryProgress } from './story.ts';

export interface Hero {
  id: string;
  heroCode: string;
  friendCode: string;
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
export interface AiStatus { configured: boolean; limit: number; left: number }
export interface AiQuiz { title: string; questions: { prompt: string; choices: string[]; answer: number; explanation: string }[]; left: number }
export type AiError = 'not_set_up' | 'too_short' | 'too_long' | 'daily_limit' | 'ai_unavailable' | 'bad_output' | 'teachers_only';
export type CharacterStatus = 'none' | 'wish' | 'new' | 'review' | 'changes' | 'approved';
export interface TeacherCharacter { status: CharacterStatus; wish: string; photo: string | null; art: string | null; artNote: string; changeNote: string }
export interface CharacterRequest { teacherId: string; name: string; status: 'new' | 'changes'; wish: string; photo: string | null; changeNote: string }
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

export interface TriviaState {
  date: string; // YYYY-MM-DD, school time
  time: string; // HH:MM
  today: boolean;
  going: boolean | null;
  goingCount: number; // heroes in my grade who are coming
}
export interface TriviaRoster {
  date: string;
  time: string;
  grades: { grade: number; going: number; names: string[] }[];
}

export interface QuestState {
  streak: number;
  milestones: { days: number; coins: number; reached: boolean; claimed: boolean }[];
  tasks: { id: string; label: string; have: number; need: number }[];
  questCoins: number;
  questClaimed: boolean;
}

export interface HouseChallenge {
  state: 'none' | 'no_house' | 'active';
  theme?: string;
  goal?: number; // average points per hero this week
  coins?: number;
  progress?: number;
  reached?: boolean;
  myPoints?: number;
  needMine?: number;
  claimed?: boolean;
}
export interface SenseiChallenge { theme: string | null; goal: number | null; coins: number | null; houses: { name: string; members: number; progress: number }[] }

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

export const HOUSE_POWERS = [
  { id: 'flame', icon: '🔥', label: 'Flame' }, { id: 'storm', icon: '⚡', label: 'Storm' }, { id: 'tide', icon: '🌊', label: 'Tide' },
  { id: 'frost', icon: '❄️', label: 'Frost' }, { id: 'earth', icon: '🌿', label: 'Earth' }, { id: 'light', icon: '✨', label: 'Light' },
  { id: 'star', icon: '⭐', label: 'Star' }, { id: 'wind', icon: '🌪️', label: 'Wind' },
] as const;
export const HOUSE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899'];
export interface HouseIdentity { name: string; color: string; power: string; motto: string }
export interface HouseOption extends HouseIdentity { id: number }
export interface HouseState {
  state: 'no_class' | 'none' | 'voting' | 'active';
  weekPoints: number;
  cap: number;
  house?: HouseIdentity & { id: string };
  className?: string;
  members?: number;
  options?: HouseOption[];
  myVote?: number | null;
}
export interface HouseTeacherView {
  state: 'none' | 'voting' | 'active';
  members?: number;
  voted?: number;
  house?: HouseIdentity;
  options?: (HouseOption & { votes: number })[];
}
export interface LeaderHouse extends HouseIdentity { grade: number; members: number; week: number; season: number; rankWeek: number; rankSeason: number; mine: boolean }
export interface LeaderHero { name: string; starter: string; week: number; season: number; rankWeek: number; rankSeason: number; me: boolean }
export interface Leaderboard { minMembers: number; houses: LeaderHouse[]; heroes: LeaderHero[] }


export interface ShopItem { id: string; kind: 'outfit' | 'accessory' | 'decor'; slot: string | null; name: string; icon: string; price: number; unlockXp: number; owned: boolean; locked: boolean; event?: string | null }
export interface SeasonEvent { id: string; name: string; icon: string; blurb: string; starts: string; ends: string; live: boolean }
export interface ShopState { coins: number; xp: number; items: ShopItem[]; equipped: Record<string, string | null>; events: SeasonEvent[] }
export interface SenseiEvent { id: string; name: string; icon: string; starts: string; ends: string; enabled: boolean; items: number }
export type ShopBuyResult = { ok: true } | { ok: false; reason: 'locked' | 'already_owned' | 'not_enough_coins' | 'event_over' };
export interface DormView {
  mine: boolean;
  name: string;
  starter: string;
  /** The owner's chosen emote, shown on their hero in the room. */
  emote: string;
  layout: { item: string; cell: number }[];
  equipped: Record<string, string | null>;
  /** Decorations this hero owns. Only sent for your own room. */
  owned: string[] | null;
}

export interface BaseView { squad: string | null; items: { cell: number; item: string; by: string; mine: boolean }[]; owned: string[]; limit: number }

export interface NexlingState {
  stages: number[];
  mine: { type: string; nickname: string; color: string; growth: number; stage: number; nextAt: number | null } | null;
}
export interface SurgeView { active: boolean; secondsLeft: number; streak: number; need: number; mult: number; started?: boolean }
export interface SkillState {
  points: number;
  surge: SurgeView;
  skills: { id: string; tree: string; tier: number; name: string; icon: string; cost: number; blurb: string; learned: boolean; ready: boolean }[];
}
export interface CardsState { packs: number; cards: { id: string; qty: number }[]; showcase: string[]; total: number }
export interface PackResult { cards: { id: string; new: boolean }[]; packs: number }
export interface TradeView {
  id: string;
  status: 'open' | 'done' | 'cancelled';
  ver: number;
  friend: string;
  friendId: string;
  myOffer: { card: string; qty: number }[];
  theirOffer: { card: string; qty: number }[];
  iConfirmed: boolean;
  theyConfirmed: boolean;
  fairness: { level: 'empty' | 'blocked' | 'uneven' | 'ok'; iGiveMore: boolean };
}
export interface TradeListItem { id: string; friend: string; friendId: string; startedByMe: boolean }
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
export interface DrawingGuess { name: string; text: string | null; correct: boolean; me: boolean }
export interface DrawingPlayer { name: string; starter: string; score: number; me: boolean; artist: boolean; solved: boolean; left: boolean }
export interface DrawingView {
  state: 'lobby' | 'playing' | 'done' | 'closed';
  phase: 'draw' | 'reveal';
  round: number;
  rounds: number;
  seconds: number;
  secondsLeft: number;
  isArtist: boolean;
  solved: boolean;
  voided: boolean;
  artist: string;
  /** The word, for the artist, for guessers who solved it, and once the round is over. */
  word: string | null;
  /** Blanks for everyone else, like "_ _ _". */
  pattern: string | null;
  /** The strokes from this index onwards; earlier ones the caller already has. */
  strokesFrom: number;
  strokes: DrawStroke[];
  guesses: DrawingGuess[];
  players: DrawingPlayer[];
}
export interface DrawingReport { artist: string; reporter: string; word: string; at: string }
export interface NexusPlayer { i: number; name: string; starter: string; me: boolean; solved: number; need: number; done: boolean; left: boolean }
export interface NexusView {
  state: 'lobby' | 'playing' | 'done' | 'closed';
  outcome: 'play' | 'won' | 'lost';
  secondsLeft: number;
  secondsTotal: number;
  /** Seconds the squad has already lost to wrong answers. */
  penalty: number;
  solved: number;
  need: number;
  wrong: number;
  question: { prompt: string; choices: string[]; hidden: number[] } | null;
  canBoost: boolean;
  players: NexusPlayer[];
}
export interface NexusAnswer { correct: boolean; rightChoice: number; explanation: string; penalty: number; over?: boolean }
export interface ChatMessage { id: number; name: string; me: boolean; body: string }
export type ChatResult = { ok: true } | { ok: false; reason: 'warning' | 'banned' | 'slow' | 'private' | 'no_class' };
export interface ChatChild { banned: boolean; requested: boolean }
export interface ChatLogLine { name: string; child: boolean; body: string; at: string }
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
  surge?: SurgeView;
}
export interface WeekSummary { weekStart: string; daysActive: number; answered: number; correct: number; subjects: { subject: Subject; answered: number; correct: number }[]; points: number; missions: number }
export interface ClassReportStudent { id: string; name: string; daysActive: number; answered: number; correct: number; points: number; missions: number }
export interface ClassReport { weekStart: string; className: string; students: ClassReportStudent[] }
export interface RaidState {
  boss: { id: string; name: string; icon: string; blurb: string };
  maxHp: number;
  damage: number;
  defeated: boolean;
  strikers: number;
  struckToday: boolean;
  /** How hard this hero's strike would hit today. */
  power: number;
  myDamage: number;
  canClaim: boolean;
  claimed: boolean;
  reward: { coins: number; xp: number };
}
export const SECRET_PLACES = ['learn', 'arcade', 'cards', 'house', 'hero', 'room', 'nexlings', 'squad', 'quest', 'profile'] as const;
export interface SecretState {
  /** The screen where this week's sparkle is hidden. */
  place: string;
  hint: string;
  found: boolean;
  finders: number;
  won: boolean;
  winnerSquad: string | null;
  mySquadWon: boolean;
  claimed: boolean;
  card: { id: string; name: string; icon: string };
}
export interface SenseiSecret { place: string; hint: string; card: string; finders: number; winnerSquad: string | null }
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
  senseiDeleteAnnouncement(id: number): Promise<void>;
  markAnnouncementsRead(): Promise<void>;
  /** The next Trivia Night, and whether this hero said they are coming. */
  triviaState(): Promise<TriviaState>;
  triviaRsvp(going: boolean): Promise<TriviaState>;

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
  childWeek(childId: string, weeksBack?: number): Promise<WeekSummary>;
  /** This hero's own weekly recap (0 = this week, 1 = last week). */
  myWeek(weeksBack?: number): Promise<WeekSummary>;
  /** Teacher progress report for one class and school week (0 = this week, 1 = last week). */
  classReport(classId: string, weeksBack?: number): Promise<ClassReport>;
  createHomeMission(childId: string, title: string, details: string, coins: number): Promise<void>;
  reviewHomeMission(id: string, approve: boolean): Promise<{ status: string; awarded: number; capped?: boolean }>;
  classes(): Promise<ClassInfo[]>;
  createClass(name: string, grade: 5 | 6): Promise<ClassInfo>;
  createClassMission(classId: string, mission: NewClassMission): Promise<void>;
  /** AI lesson helper (teachers): is it switched on, and how many drafts are left today. */
  aiStatus(): Promise<AiStatus>;
  /** Drafts a quiz from lesson text. Throws an Error whose message is an AiError. */
  aiDraftQuiz(lesson: string, grade: 5 | 6, count: number): Promise<AiQuiz>;
  /** Teacher character requests: photo and wish list go to the Sensei; the art comes back for approval. */
  teacherCharacter(): Promise<TeacherCharacter>;
  teacherCharacterWish(wish: string): Promise<void>;
  teacherCharacterSubmit(photo: string, wish: string): Promise<void>;
  teacherCharacterRespond(approve: boolean, note: string): Promise<void>;
  teacherCharacterRemovePhoto(): Promise<void>;
  senseiCharacterQueue(): Promise<CharacterRequest[]>;
  senseiCharacterDeliver(teacherId: string, art: string, note: string): Promise<void>;
  classResults(classId: string): Promise<ClassMissionResults[]>;
  resetSubmission(missionId: string, childId: string): Promise<void>;
  /** Which reward games are open today and which ones this hero already collected. */
  arcadeStatus(): Promise<ArcadeStatus>;
  /** Pays the daily reward for a finished game, once per game per school day. */
  arcadeClaim(game: string): Promise<{ awarded: number; duplicate: boolean; capped: boolean }>;
  friends(): Promise<Friends>;
  /** Ask another hero to be friends using their hero code. Resolves with their name. */
  friendCodeReset(): Promise<string>;
  requestFriend(code: string): Promise<string>;
  respondFriend(id: string, accept: boolean): Promise<void>;
  removeFriend(id: string): Promise<void>;
  mySquad(): Promise<SquadView>;
  createSquad(adjective: string, noun: string): Promise<void>;
  inviteToSquad(friendHeroId: string): Promise<void>;
  respondSquadInvite(squadId: string, accept: boolean): Promise<void>;
  leaveSquad(): Promise<void>;
  cardsState(): Promise<CardsState>;
  openPack(): Promise<PackResult>;
  setShowcase(cardIds: string[]): Promise<void>;
  tradeOpen(friendHeroId: string): Promise<string>;
  tradeList(): Promise<TradeListItem[]>;
  tradeView(tradeId: string): Promise<TradeView>;
  /** Replace your side of the offer. Any change clears both confirmations. */
  tradeSet(tradeId: string, offer: { card: string; qty: number }[]): Promise<void>;
  /** Confirm this exact version of the trade. `ack` must be true when the trade is uneven. */
  tradeConfirm(tradeId: string, ver: number, ack: boolean): Promise<{ ok: boolean; done?: boolean; reason?: string }>;
  tradeCancel(tradeId: string): Promise<void>;
  /** Sensei only: hand any card to the hero with this code. Resolves with the hero's name. */
  senseiGiveCard(heroCode: string, cardId: string): Promise<string>;
  skillState(): Promise<SkillState>;
  skillLearn(skillId: string): Promise<{ ok: true } | { ok: false; reason: 'locked' | 'already_learned' | 'not_enough_points' }>;
  nexlingState(): Promise<NexlingState>;
  /** Pick a Nexling, or change the name and colour of the one you have. A different type starts growing from zero. */
  nexlingAdopt(type: string, nickname: string, color: string): Promise<void>;
  shopState(): Promise<ShopState>;
  shopBuy(itemId: string): Promise<ShopBuyResult>;
  /** Wear an owned item in its slot, or pass null to take the slot off. */
  heroEquip(slot: string, itemId: string | null): Promise<void>;
  /** Your own dorm room, or a friend's when you pass their hero id. */
  dormGet(friendHeroId?: string): Promise<DormView>;
  dormSave(layout: { item: string; cell: number }[]): Promise<void>;
  houseState(): Promise<HouseState>;
  houseChallenge(): Promise<HouseChallenge>;
  /** The school boss raid: one boss a week, one strike a day, a reward once it falls. */
  raidState(): Promise<RaidState>;
  raidStrike(): Promise<{ ok: boolean; damage?: number; defeated?: boolean; reason?: 'defeated' | 'already_struck' }>;
  raidClaim(): Promise<{ awarded: number; duplicate: boolean }>;
  /** The weekly secret: a sparkle hidden on one screen. The first squad to find it wins a card. */
  secretState(): Promise<SecretState>;
  secretFind(): Promise<{ ok: boolean; firstSquad?: boolean }>;
  secretClaim(): Promise<{ ok: boolean }>;
  senseiSecret(): Promise<SenseiSecret>;
  senseiSecretSet(place: string, hint: string, card: string): Promise<void>;
  /** Stickers: made from fixed choices, given to squad mates. */
  stickerList(): Promise<StickerBook>;
  stickerMake(design: StickerDesign): Promise<{ ok: boolean; reason?: 'daily_limit' | 'full' }>;
  stickerGive(stickerId: number, toHero: string): Promise<{ ok: boolean; reason?: 'full' }>;
  /** Class vs class race: this month (0) or last month (1), class names only. */
  raceState(back?: number): Promise<RaceState>;
  /** Avatar studio: mix hair, makeup, aura, an owned outfit and accessory; pin it for friends to like. */
  lookGet(): Promise<LookState>;
  lookSave(look: Look, pinned: boolean): Promise<void>;
  lookGallery(): Promise<GalleryLook[]>;
  lookLike(heroId: string): Promise<void>;
  /** The squad hideout: a shared room the squad decorates together with decorations they own. */
  baseGet(): Promise<BaseView>;
  basePlace(cell: number, item: string): Promise<void>;
  baseRemove(cell: number): Promise<void>;
  /** The weekly treasure hunt: four clues, each a pin hidden on one screen; the full map pays a card. */
  treasureState(): Promise<TreasureState>;
  treasureFind(place: string): Promise<{ ok: boolean; done?: boolean }>;
  treasureClaim(): Promise<{ ok: boolean }>;
  /** Ids of the achievement-wall badges this hero has earned. */
  badgeWall(): Promise<string[]>;
  /** Secret codes: a teacher (their class) or the Sensei (everyone) makes a code word; kids redeem it once. */
  codeCreate(classId: string | null, coins: number, xp: number, announce?: boolean): Promise<string>;
  codeMine(): Promise<MadeCode[]>;
  codeRedeem(code: string): Promise<RedeemResult>;
  /** Weekly room contest: enter your room, vote once for a squad or House mate's room. */
  contestState(): Promise<ContestState>;
  contestEnter(): Promise<void>;
  contestVote(heroId: string): Promise<void>;
  contestClaim(): Promise<{ ok: boolean }>;
  /** Comics: three panels from fixed lists, shareable with your squad. */
  comicList(): Promise<Comic[]>;
  comicSquad(): Promise<Comic[]>;
  comicMake(panels: ComicPanels): Promise<void>;
  comicShare(id: number, share: boolean): Promise<void>;
  comicDelete(id: number): Promise<void>;
  houseChallengeClaim(): Promise<{ awarded: number; duplicate: boolean }>;
  houseVote(optionId: number): Promise<void>;
  leaderboard(): Promise<Leaderboard>;
  houseTeacherView(classId: string): Promise<HouseTeacherView>;
  /** Teacher: put two or three House identities up for a class vote. */
  houseProposeOptions(classId: string, options: HouseIdentity[]): Promise<void>;
  houseCloseVote(classId: string): Promise<void>;
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
  drawingView(code: string, since: number): Promise<DrawingView>;
  /** Squad Drawing: adds points to the stroke with this id (a new stroke starts when the id is new). */
  drawingStroke(id: number, color: string, width: number, points: [number, number][]): Promise<void>;
  drawingClear(): Promise<void>;
  drawingGuess(text: string): Promise<{ correct: boolean; points: number }>;
  drawingReport(): Promise<void>;
  senseiDrawingReports(): Promise<DrawingReport[]>;
  nexusView(code: string): Promise<NexusView>;
  nexusAnswer(choice: number): Promise<NexusAnswer>;
  nexusBoost(index: number): Promise<void>;
  chatSend(text: string): Promise<ChatResult>;
  chatRead(): Promise<{ banned: boolean; canChat: boolean; messages: ChatMessage[] }>;
  childChat(childId: string): Promise<ChatChild>;
  chatRequestUnlock(childId: string): Promise<void>;
  senseiChatRequests(): Promise<ChatRequest[]>;
  chatUnlock(childId: string): Promise<void>;
  senseiChatLog(childId: string): Promise<ChatLogLine[]>;
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
  senseiTriviaRoster(): Promise<TriviaRoster>;
  senseiChallenge(): Promise<SenseiChallenge>;
  senseiSetChallenge(theme: string, goal: number, coins: number): Promise<void>;
  senseiEvents(): Promise<SenseiEvent[]>;
  senseiSetEvent(id: string, starts: string, ends: string, enabled: boolean): Promise<void>;
  showcaseState(): Promise<ShowcaseState>;
  showcaseSet(title: string, pose: string): Promise<void>;
  /** Pick an emote you have enough XP for. */
  emoteSet(emote: string): Promise<void>;
  questState(): Promise<QuestState>;
  questClaim(): Promise<{ awarded: number; duplicate: boolean }>;
  streakClaim(days: number): Promise<{ awarded: number; duplicate: boolean }>;
  storyState(): Promise<StoryProgress[]>;
  storySave(episode: string, panel: number): Promise<void>;
  storyChoose(episode: string, panelId: string, option: string): Promise<StoryChoiceResult>;
  storyAnswer(episode: string, checkpoint: string, choice: number): Promise<StoryAnswerResult>;
  storyComplete(episode: string): Promise<StoryDone>;
  advState(): Promise<AdvProgress[]>;
  advAnswer(caseId: string, step: string, choice: number): Promise<AdvAnswerResult>;
  advComplete(caseId: string): Promise<AdvDone>;
  /** Gives every hero who said yes the same prize, once per night. Returns how many got it. */
  senseiTriviaPrize(coins: number): Promise<number>;
}

export const emptyBalances = (): Balances => ({ coins: 0, xp: 0, skill_points: 0, nexling_growth: 0, house_score: 0 });
