import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { createBackend } from './lib/index.ts';
import type { Adult, Backend, Balances, Hero } from './lib/backend.ts';
import { emptyBalances } from './lib/backend.ts';
import { flushAnswers } from './lib/offline.ts';
import { Welcome } from './screens/Welcome.tsx';
import { Onboarding } from './screens/Onboarding.tsx';
import { SignIn } from './screens/SignIn.tsx';
import { Home } from './screens/Home.tsx';
import { Destination } from './screens/Destination.tsx';
import { Notifications } from './screens/Notifications.tsx';
import { Profile } from './screens/Profile.tsx';
import { LearnHome, Practice } from './screens/Learn.tsx';
import type { Subject } from './lib/backend.ts';
import { Adventures } from './screens/Adventures.tsx';
import { Quest } from './screens/Quest.tsx';
import { Privacy } from './screens/Privacy.tsx';
import { Showcase } from './screens/Showcase.tsx';
import { Guide } from './screens/Guide.tsx';
import { MyWeek } from './screens/MyWeek.tsx';
import { Raid } from './screens/Raid.tsx';
import { Stickers } from './screens/Stickers.tsx';
import { Comics } from './screens/Comics.tsx';
import { Treasure, TreasureSpot } from './screens/Treasure.tsx';
import { HUNTS } from './lib/treasure.ts';
import type { TreasureState } from './lib/treasure.ts';
import { SquadBase } from './screens/SquadBase.tsx';
import { Studio } from './screens/Studio.tsx';
import { Goofy } from './screens/Goofy.tsx';
import { Kindness } from './screens/Kindness.tsx';
import { WhackShadow } from './games/WhackShadow.tsx';
import { Voice } from './screens/Voice.tsx';
import { BubblePop } from './games/BubblePop.tsx';
import { BlockBlast } from './games/BlockBlast.tsx';
import { HeroDefense } from './games/HeroDefense.tsx';
import { Race } from './screens/Race.tsx';
import { Badges } from './screens/Badges.tsx';
import { Codes } from './screens/Codes.tsx';
import { Contest } from './screens/Contest.tsx';
import { Secret, SecretSpot } from './screens/Secret.tsx';
import type { SecretState } from './lib/backend.ts';
import { Announcements, ClassMissions, HomeMissions, MissionsHome, ParentCode, Quiz } from './screens/Missions.tsx';
import { Squad } from './screens/Squad.tsx';
import { House } from './screens/House.tsx';
import { MyHero } from './screens/MyHero.tsx';
import { MyRoom } from './screens/MyRoom.tsx';
import { Nexlings } from './screens/Nexlings.tsx';
import { Cards } from './screens/Cards.tsx';
import { Arcade } from './screens/Arcade.tsx';
import { PatternPulse } from './games/PatternPulse.tsx';
import { Arena } from './games/Arena.tsx';
import { RhythmTap } from './games/RhythmTap.tsx';
import { MemoryFlip } from './games/MemoryFlip.tsx';
import { WordBuilder } from './games/WordBuilder.tsx';
import { SpotDifference } from './games/SpotDifference.tsx';
import { WordRush } from './games/WordRush.tsx';
import { FunBox } from './games/FunBox.tsx';
import { TriviaClash } from './games/TriviaClash.tsx';
import { Odin } from './games/Odin.tsx';
import { ShadowSignal } from './games/ShadowSignal.tsx';
import { SquadDrawing } from './games/SquadDrawing.tsx';
import { EscapeNexus } from './games/EscapeNexus.tsx';
import { DoNotPress } from './games/DoNotPress.tsx';
import { AdultAuth } from './screens/adult/AdultAuth.tsx';
import { NewPassword } from './screens/adult/NewPassword.tsx';
import { AdultApp } from './screens/adult/AdultApp.tsx';

interface Session {
  backend: Backend;
  hero: Hero;
  balances: Balances;
  dailyAvailable: boolean;
  unread: number;
  missionDot: boolean;
  arcadeDot: boolean;
  questDot: boolean;
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
  const [resetting, setResetting] = useState(() => backend.resetPending());
  const [balances, setBalances] = useState<Balances>(() => {
    try { return { ...emptyBalances(), ...JSON.parse(localStorage.getItem('hh-balances') ?? '{}') }; } catch { return emptyBalances(); }
  });
  const [dailyAvailable, setDailyAvailable] = useState(false);
  const [unread, setUnread] = useState(0);
  const [missionDot, setMissionDot] = useState(false);
  const [arcadeDot, setArcadeDot] = useState(false);
  const [questDot, setQuestDot] = useState(false);
  const [privacy, setPrivacy] = useState(false);

  const [secret, setSecret] = useState<SecretState | null>(null);
  const [treasure, setTreasure] = useState<TreasureState | null>(null);
  const refresh = useCallback(async () => {
    const [b, d] = await Promise.all([backend.balances(), backend.dailyStatus()]);
    setBalances(b);
    try { localStorage.setItem('hh-balances', JSON.stringify(b)); } catch { /* blocked storage */ }
    setDailyAvailable(d.available);
    // The rest is nice to have: a failure here must not hide the balance.
    backend.secretState().then(setSecret).catch(() => undefined);
    backend.treasureState().then(setTreasure).catch(() => undefined);
    backend.announcements().then((a) => setUnread(a.unread)).catch(() => undefined);
    backend.arcadeStatus().then((a) => setArcadeDot(a.games.some((g) => !a.claimed.includes(g)))).catch(() => undefined);
    backend.questState().then((q) => setQuestDot(q.milestones.some((m) => m.reached && !m.claimed) || (!q.questClaimed && q.tasks.every((t) => t.have >= t.need)))).catch(() => undefined);
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

  // Practice answers given without Wi-Fi are sent when the app opens and whenever the connection returns.
  useEffect(() => {
    if (!hero) return;
    const sendWaiting = () => { flushAnswers(backend, hero.id).then((r) => { if (r.sent) refresh().catch(() => undefined); }).catch(() => undefined); };
    sendWaiting();
    window.addEventListener('online', sendWaiting);
    return () => window.removeEventListener('online', sendWaiting);
  }, [hero, backend, refresh]);

  // Tell the Sensei this person is here: on every screen change, then about once a minute while visible.
  const who = hero ? 'hero' : adult && adult.role !== 'sensei' ? 'adult' : null;
  useEffect(() => {
    if (!who) return;
    const send = () => { if (document.visibilityState === 'visible') backend.ping(who === 'hero' ? screen : 'adult').catch(() => undefined); };
    send();
    const id = setInterval(send, 60000);
    document.addEventListener('visibilitychange', send);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', send); };
  }, [backend, who, screen]);

  const enterHero = (h: Hero) => { setHero(h); setScreen('home'); };
  const signOut = useCallback(async () => {
    await backend.signOut();
    try { localStorage.removeItem('hh-balances'); } catch { /* blocked storage */ }
    setHero(null);
    setAdult(null);
    setBalances(emptyBalances());
    setUnread(0);
    setMissionDot(false);
    setArcadeDot(false);
    setQuestDot(false);
    setScreen('welcome');
  }, [backend]);

  if (!ready) return <main className="screen center"><div className="spinner" aria-label="Loading" /></main>;

  if (privacy) return <Privacy onBack={() => setPrivacy(false)} />;

  if (resetting) return <NewPassword backend={backend} onDone={() => { setResetting(false); backend.restore().then((who) => { if (who?.kind === 'adult') setAdult(who.adult); }).catch(() => undefined); }} />;

  if (adult) return <AdultApp backend={backend} adult={adult} onAdult={setAdult} onSignOut={signOut} onPrivacy={() => setPrivacy(true)} />;

  if (!hero) {
    if (screen === 'new') return <Onboarding backend={backend} onDone={enterHero} onBack={() => setScreen('welcome')} />;
    if (screen === 'signin') return <SignIn backend={backend} onDone={enterHero} onBack={() => setScreen('welcome')} />;
    if (screen === 'adult') return <AdultAuth backend={backend} onDone={setAdult} onBack={() => setScreen('welcome')} />;
    return <Welcome demo={backend.mode === 'demo'} onNew={() => setScreen('new')} onSignIn={() => setScreen('signin')} onAdult={() => setScreen('adult')} onPrivacy={() => setPrivacy(true)} />;
  }

  const session: Session = { backend, hero, balances, dailyAvailable, unread, missionDot, arcadeDot, questDot, refresh, signOut, go: setScreen };
  const quizId = screen.startsWith('quiz:') ? screen.slice(5) : null;
  const practiceSubject = screen.startsWith('practice:') ? (screen.slice(9) as Subject) : null;
  return (
    <SessionContext.Provider value={session}>
      {screen === 'home' && <Home />}
      {screen === 'profile' && <Profile />}
      {screen === 'missions' && <MissionsHome />}
      {screen === 'missions-home' && <HomeMissions />}
      {screen === 'missions-class' && <ClassMissions />}
      {quizId && <Quiz id={quizId} />}
      {screen === 'learn' && <LearnHome />}
      {practiceSubject && <Practice subject={practiceSubject} />}
      {screen === 'arcade' && <Arcade />}
      {screen === 'squad' && <Squad />}
      {screen === 'house' && <House />}
      {screen === 'hero' && <MyHero />}
      {screen === 'room' && <MyRoom />}
      {screen === 'nexlings' && <Nexlings />}
      {screen === 'cards' && <Cards />}
      {screen === 'adventures' && <Adventures />}
      {screen === 'quest' && <Quest />}
      {screen === 'showcase' && <Showcase />}
      {screen === 'privacy' && <Privacy onBack={() => setScreen('profile')} />}
      {screen === 'guide' && <Guide />}
      {screen === 'myweek' && <MyWeek />}
      {screen === 'raid' && <Raid />}
      {screen === 'stickers' && <Stickers />}
      {screen === 'comics' && <Comics />}
      {screen === 'contest' && <Contest />}
      {screen === 'codes' && <Codes />}
      {screen === 'badges' && <Badges />}
      {screen === 'race' && <Race />}
      {screen === 'voice' && <Voice />}
      {screen === 'kindness' && <Kindness />}
      {screen === 'goofy' && <Goofy />}
      {screen === 'studio' && <Studio />}
      {screen === 'base' && <SquadBase />}
      {screen === 'treasure' && <Treasure />}
      {treasure && !treasure.done && HUNTS[treasure.hunt].steps[treasure.step].place === screen && <TreasureSpot step={treasure.step} place={screen} onFound={() => backend.treasureState().then(setTreasure).catch(() => undefined)} />}
      {screen === 'secret' && <Secret />}
      {secret && !secret.found && secret.place === screen && <SecretSpot week={Math.floor(Date.parse(new Date().toISOString().slice(0, 10)) / 604800000)} onFound={() => backend.secretState().then(setSecret).catch(() => undefined)} />}
      {screen === 'game:pattern-pulse' && <PatternPulse />}
      {screen === 'game:rhythm-tap' && <RhythmTap />}
      {screen === 'game:arena' && <Arena />}
      {screen === 'game:memory-flip' && <MemoryFlip />}
      {screen === 'game:word-builder' && <WordBuilder />}
      {screen === 'game:spot-difference' && <SpotDifference />}
      {screen === 'game:word-rush' && <WordRush />}
      {screen === 'game:trivia-clash' && <TriviaClash />}
      {screen === 'game:odin' && <Odin />}
      {screen === 'game:shadow-signal' && <ShadowSignal />}
      {screen === 'game:squad-drawing' && <SquadDrawing />}
      {screen === 'game:escape-nexus' && <EscapeNexus />}
      {screen === 'game:whack-shadow' && <WhackShadow />}
      {screen === 'game:bubble-pop' && <BubblePop />}
      {screen === 'game:block-blast' && <BlockBlast />}
      {screen === 'game:hero-defense' && <HeroDefense />}
      {screen === 'game:shadow-spy' && <ShadowSignal emoji />}
      {screen === 'game:fun-box' && <FunBox />}
      {screen === 'donotpress' && <DoNotPress />}
      {screen === 'announcements' && <Announcements />}
      {screen === 'parentcode' && <ParentCode />}
      {screen === 'notifications' && <Notifications />}
      {!['home', 'profile', 'missions', 'missions-home', 'missions-class', 'announcements', 'parentcode', 'learn', 'arcade', 'squad', 'house', 'hero', 'room', 'nexlings', 'cards', 'adventures', 'quest', 'showcase', 'guide', 'myweek', 'raid', 'secret', 'stickers', 'comics', 'contest', 'codes', 'badges', 'treasure', 'base', 'studio', 'race', 'kindness', 'privacy', 'voice', 'goofy', 'notifications', 'notifications', 'donotpress'].includes(screen) && !screen.startsWith('game:') && !quizId && !practiceSubject && <Destination id={screen} />}
    </SessionContext.Provider>
  );
}
