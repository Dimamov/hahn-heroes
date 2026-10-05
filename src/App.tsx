import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createBackend } from './lib/index.ts';
import type { Backend, Balances, Hero } from './lib/backend.ts';
import { emptyBalances } from './lib/backend.ts';
import { Welcome } from './screens/Welcome.tsx';
import { Onboarding } from './screens/Onboarding.tsx';
import { SignIn } from './screens/SignIn.tsx';
import { Home } from './screens/Home.tsx';
import { Destination } from './screens/Destination.tsx';
import { Profile } from './screens/Profile.tsx';

interface Session {
  backend: Backend;
  hero: Hero;
  balances: Balances;
  dailyAvailable: boolean;
  refresh: () => Promise<void>;
  signOut: () => Promise<void>;
  go: (screen: string) => void;
}
const SessionContext = createContext<Session | null>(null);
export const useSession = () => {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useSession outside a signed-in screen');
  return s;
};

type Screen = 'welcome' | 'new' | 'signin' | 'home' | string;

export default function App() {
  const backend = useMemo(createBackend, []);
  const [ready, setReady] = useState(false);
  const [hero, setHero] = useState<Hero | null>(null);
  const [screen, setScreen] = useState<Screen>('welcome');
  const [balances, setBalances] = useState<Balances>(emptyBalances());
  const [dailyAvailable, setDailyAvailable] = useState(false);

  const refresh = useCallback(async () => {
    const [b, d] = await Promise.all([backend.balances(), backend.dailyStatus()]);
    setBalances(b);
    setDailyAvailable(d.available);
  }, [backend]);

  useEffect(() => {
    backend.restore().then((h) => {
      if (h) { setHero(h); setScreen('home'); }
      setReady(true);
    }).catch(() => setReady(true));
  }, [backend]);

  useEffect(() => {
    if (hero) refresh().catch(() => undefined);
  }, [hero, refresh]);

  const enter = (h: Hero) => { setHero(h); setScreen('home'); };
  const signOut = useCallback(async () => {
    await backend.signOut();
    setHero(null);
    setBalances(emptyBalances());
    setScreen('welcome');
  }, [backend]);

  if (!ready) return <main className="screen center"><div className="spinner" aria-label="Loading" /></main>;

  if (!hero) {
    if (screen === 'new') return <Onboarding backend={backend} onDone={enter} onBack={() => setScreen('welcome')} />;
    if (screen === 'signin') return <SignIn backend={backend} onDone={enter} onBack={() => setScreen('welcome')} />;
    return <Welcome demo={backend.mode === 'demo'} onNew={() => setScreen('new')} onSignIn={() => setScreen('signin')} />;
  }

  const session: Session = { backend, hero, balances, dailyAvailable, refresh, signOut, go: setScreen };
  return (
    <SessionContext.Provider value={session}>
      {screen === 'home' && <Home />}
      {screen === 'profile' && <Profile />}
      {screen !== 'home' && screen !== 'profile' && <Destination id={screen} />}
    </SessionContext.Provider>
  );
}
