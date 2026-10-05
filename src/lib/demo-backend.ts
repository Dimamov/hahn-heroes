// Demo mode: the same rules as the server, saved only on this device. Lets the app run
// before a Supabase project is connected. Nothing here is secure; it is for trying the app.
import {
  DAILY_LOGIN_COINS, WEEKLY_CAPS, schoolDate, schoolWeek, type Currency, type RewardSource,
} from '../../supabase/functions/_shared/rewards.ts';
import {
  LOCKOUT_MINUTES, MAX_FAILED_TRIES, generateHeroCode, heroDisplayName, isGrade, isStarterHero, isValidPicture,
  normalizeHeroCode,
} from '../../supabase/functions/_shared/kid-auth.ts';
import { SignInError, emptyBalances, type Backend, type Hero, type SignUpInput } from './backend.ts';

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
interface Db {
  accounts: Record<string, Account>; // by hero code
  ledger: LedgerRow[];
  current: string | null; // hero id
}

const KEY = 'hahn-heroes-demo-v1';

export function createDemoBackend(storage: Pick<Storage, 'getItem' | 'setItem'>, now: () => Date = () => new Date()): Backend {
  const load = (): Db => {
    try {
      const raw = storage.getItem(KEY);
      if (raw) return JSON.parse(raw) as Db;
    } catch { /* corrupted or blocked storage: start fresh */ }
    return { accounts: {}, ledger: [], current: null };
  };
  const save = (db: Db) => {
    try { storage.setItem(KEY, JSON.stringify(db)); } catch { /* private mode: keep going in memory only */ }
  };
  let memory = load();
  const db = () => memory;
  const commit = () => save(memory);

  const strip = ({ picture: _p, failures: _f, ...hero }: Account): Hero => hero;
  const me = (): Account => {
    const acct = Object.values(db().accounts).find((a) => a.id === db().current);
    if (!acct) throw new Error('not signed in');
    return acct;
  };

  /** Mirrors award() in the database: once per key, mission coins capped per school week. */
  function award(heroId: string, currency: Currency, amount: number, source: RewardSource, key: string) {
    const d = db();
    if (d.ledger.some((r) => r.heroId === heroId && r.currency === currency && r.key === key)) {
      return { awarded: 0, duplicate: true };
    }
    const week = schoolWeek(now());
    let grant = amount;
    const cap = currency === 'coins' ? WEEKLY_CAPS[source] : undefined;
    if (cap !== undefined) {
      const used = d.ledger
        .filter((r) => r.heroId === heroId && r.currency === 'coins' && r.source === source && r.week === week)
        .reduce((s, r) => s + r.amount, 0);
      grant = Math.max(0, Math.min(amount, cap - used));
    }
    d.ledger.push({ heroId, currency, amount: grant, source, key, week });
    commit();
    return { awarded: grant, duplicate: false };
  }

  const dailyKey = () => `daily:${schoolDate(now())}`;

  return {
    mode: 'demo',
    async restore() {
      const d = db();
      const acct = Object.values(d.accounts).find((a) => a.id === d.current);
      return acct ? strip(acct) : null;
    },
    async signUp(input: SignUpInput) {
      const name = heroDisplayName(input.nameAdjective, input.nameNoun);
      if (!name || !isGrade(input.grade) || !isStarterHero(input.hero) || !isValidPicture(input.picture)) {
        throw new Error('invalid_request');
      }
      const d = db();
      let code = generateHeroCode();
      while (d.accounts[code]) code = generateHeroCode();
      const acct: Account = {
        id: crypto.randomUUID(), heroCode: code, displayName: name, grade: input.grade, starter: input.hero,
        picture: input.picture, failures: [],
      };
      d.accounts[code] = acct;
      d.current = acct.id;
      commit();
      return strip(acct);
    },
    async signIn(heroCode, picture) {
      const d = db();
      const acct = d.accounts[normalizeHeroCode(heroCode)];
      const at = now().getTime();
      const window = LOCKOUT_MINUTES * 60_000;
      if (acct) {
        const recent = acct.failures.filter((t) => at - t < window);
        if (recent.length >= MAX_FAILED_TRIES) {
          throw new SignInError('resting', { retryAfter: Math.ceil((recent[0] + window - at) / 1000) });
        }
        acct.failures = recent;
      }
      if (!acct || acct.picture.join() !== picture.join()) {
        if (acct) {
          acct.failures.push(at);
          commit();
        }
        throw new SignInError('wrong', { triesLeft: acct ? MAX_FAILED_TRIES - acct.failures.length : undefined });
      }
      acct.failures = [];
      d.current = acct.id;
      commit();
      return strip(acct);
    },
    async signOut() {
      db().current = null;
      commit();
    },
    async balances() {
      const out = emptyBalances();
      for (const r of db().ledger) if (r.heroId === me().id) out[r.currency] += r.amount;
      return out;
    },
    async dailyStatus() {
      const id = me().id;
      const taken = db().ledger.some((r) => r.heroId === id && r.currency === 'coins' && r.key === dailyKey());
      return { available: !taken, amount: DAILY_LOGIN_COINS };
    },
    async claimDaily() {
      return award(me().id, 'coins', DAILY_LOGIN_COINS, 'daily', dailyKey());
    },
  };
}
