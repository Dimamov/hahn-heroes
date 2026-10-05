import { createClient } from '@supabase/supabase-js';
import { SignInError, emptyBalances, type Backend, type Hero, type SignUpInput } from './backend.ts';
import type { Currency } from '../../supabase/functions/_shared/rewards.ts';

export function createSupabaseBackend(url: string, publishableKey: string): Backend {
  const sb = createClient(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  async function loadHero(): Promise<Hero | null> {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data, error } = await sb.from('heroes').select('*').eq('id', session.user.id).maybeSingle();
    if (error || !data) return null;
    return { id: data.id, heroCode: data.hero_code, displayName: data.display_name, grade: data.grade, starter: data.starter_hero };
  }

  async function signInWithFunction(heroCode: string, picture: number[]): Promise<Hero> {
    const { data, error } = await sb.functions.invoke('kid-signin', { body: { heroCode, picture } });
    if (error) {
      const res = (error as { context?: Response }).context;
      const body = res && typeof res.json === 'function' ? await res.json().catch(() => null) : null;
      if (body?.error === 'resting') throw new SignInError('resting', { retryAfter: body.retryAfter });
      if (body?.error === 'wrong_code_or_pictures') throw new SignInError('wrong', { triesLeft: body.triesLeft });
      throw new SignInError('network');
    }
    await sb.auth.setSession(data.session);
    const hero = await loadHero();
    if (!hero) throw new SignInError('network');
    return hero;
  }

  return {
    mode: 'supabase',
    restore: loadHero,
    async signUp(input: SignUpInput) {
      const { data, error } = await sb.functions.invoke('kid-signup', { body: input });
      if (error || !data?.heroCode) throw new Error('signup_failed');
      return signInWithFunction(data.heroCode, input.picture);
    },
    signIn: signInWithFunction,
    async signOut() {
      await sb.auth.signOut();
    },
    async balances() {
      const out = emptyBalances();
      const { data } = await sb.from('my_balances').select('currency, balance');
      for (const row of data ?? []) out[row.currency as Currency] = row.balance;
      return out;
    },
    async dailyStatus() {
      const { data, error } = await sb.rpc('daily_reward_status');
      if (error) throw error;
      return { available: data.available, amount: data.amount };
    },
    async claimDaily() {
      const { data, error } = await sb.rpc('claim_daily_reward');
      if (error) throw error;
      return { awarded: data.awarded, duplicate: data.duplicate };
    },
  };
}
