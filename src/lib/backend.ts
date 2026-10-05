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
