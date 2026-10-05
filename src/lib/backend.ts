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

export type Balances = Record<Currency, number>;

export class SignInError extends Error {
  constructor(
    public kind: 'wrong' | 'resting' | 'network',
    public detail?: { triesLeft?: number; retryAfter?: number },
  ) {
    super(kind);
  }
}

/** Everything the app needs from a server. The demo and Supabase versions behave the same. */
export interface Backend {
  mode: 'demo' | 'supabase';
  restore(): Promise<Hero | null>;
  signUp(input: SignUpInput): Promise<Hero>;
  signIn(heroCode: string, picture: number[]): Promise<Hero>;
  signOut(): Promise<void>;
  balances(): Promise<Balances>;
  dailyStatus(): Promise<{ available: boolean; amount: number }>;
  claimDaily(): Promise<{ awarded: number; duplicate: boolean }>;
}

export const emptyBalances = (): Balances => ({ coins: 0, xp: 0, skill_points: 0, nexling_growth: 0, house_score: 0 });
