import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createBackend } from './lib/index.ts';
import type { Adult, Backend, Balances, Hero } from './lib/backend.ts';
import { emptyBalances } from './lib/backend.ts';
import { Welcome } from './screens/Welcome.tsx';
import { Onboarding } from './screens/Onboarding.tsx';
import { SignIn } from './screens/SignIn.tsx';
import { Home } from './screens/Home.tsx';
import { Destination } from './screens/Destination.tsx';
import { Profile } from './screens/Profile.tsx';
import { Announcements, ClassMissions, HomeMissions, MissionsHome, ParentCode, Quiz } from './screens/Missions.tsx';
import { AdultAuth } from './screens/adult/AdultAuth.tsx';
import { AdultApp } from './screens/adult/AdultApp.tsx';

interface Session {
  backend: Backend;
  hero: Hero;
  balances: Balances;
  dailyAvailable: boolean;
  unread: number;
  missionDot: boolean;
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

type Screen = 'welcome' | 'new' | 'signin' | 'adult' | 'home' | string;

export default function App() {
  const backend = useMemo(createBackend, []);
  const [ready, setReady] = useState(false);
  const [hero, setHero] = useState<Hero | null>(null);
  const [adult, setAdult] = useState<Adult | null>(null);
  const [screen, setScreen] = useState<Screen>('welcome');
  const [balances, setBalances] = useState<Balances>(emptyBalances());
  const [dailyAvailable, setDailyAvailable] = useState(false);
  const [unread, setUnread] = useState(0);
  const [missionDot, setMissionDot] = useState(false);

  const refresh = useCallback(async () => {
    const [b, d] = await Promise.all([backend.balances(), backend.dailyStatus()]);
    setBalances(b);
    setDailyAvailable(d.available);
    // The rest is nice to have: a failure here must not hide the balance.
    backend.announcements().then((a) => setUnread(a.unread)).catch(() => undefined);
    Promise.all([backend.homeMissions(), backend.classMissions()])
      .then(([home, cls]) => setMissionDot(home.some((m) => m.status === 'assigned' || m.status === 'sent_back') || cls.some((m) => !m.result)))
      .catch(() => undefined);
  }, [backend]);

  useEffect(() => {
    backend.restore().then((who) => {
      if (who?.kind === 'hero') { setHero(who.hero); setScreen('home'); }
      if (who?.kind === 'adult') setAdult(who.adult);
      setReady(true);
    }).catch(() => setReady(true));
  }, [backend]);

  useEffect(() => {
    if (hero) refresh().catch(() => undefined);
  }, [hero, refresh]);

  const enterHero = (h: Hero) => { setHero(h); setScreen('home'); };
  const signOut = useCallback(async () => {
    await backend.signOut();
    setHero(null);
    setAdult(null);
    setBalances(emptyBalances());
    setUnread(0);
    setMissionDot(false);
    setScreen('welcome');
  }, [backend]);

  if (!ready) return <main className="screen center"><div className="spinner" aria-label="Loading" /></main>;

  if (adult) return <AdultApp backend={backend} adult={adult} onAdult={setAdult} onSignOut={signOut} />;

  if (!hero) {
    if (screen === 'new') return <Onboarding backend={backend} onDone={enterHero} onBack={() => setScreen('welcome')} />;
    if (screen === 'signin') return <SignIn backend={backend} onDone={enterHero} onBack={() => setScreen('welcome')} />;
    if (screen === 'adult') return <AdultAuth backend={backend} onDone={setAdult} onBack={() => setScreen('welcome')} />;
    return <Welcome demo={backend.mode === 'demo'} onNew={() => setScreen('new')} onSignIn={() => setScreen('signin')} onAdult={() => setScreen('adult')} />;
  }

  const session: Session = { backend, hero, balances, dailyAvailable, unread, missionDot, refresh, signOut, go: setScreen };
  const quizId = screen.startsWith('quiz:') ? screen.slice(5) : null;
  return (
    <SessionContext.Provider value={session}>
      {screen === 'home' && <Home />}
      {screen === 'profile' && <Profile />}
      {screen === 'missions' && <MissionsHome />}
      {screen === 'missions-home' && <HomeMissions />}
      {screen === 'missions-class' && <ClassMissions />}
      {quizId && <Quiz id={quizId} />}
      {screen === 'announcements' && <Announcements />}
      {screen === 'parentcode' && <ParentCode />}
      {!['home', 'profile', 'missions', 'missions-home', 'missions-class', 'announcements', 'parentcode'].includes(screen) && !quizId && <Destination id={screen} />}
    </SessionContext.Provider>
  );
}
