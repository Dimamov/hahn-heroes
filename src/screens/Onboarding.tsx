import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import { SignUpError, type Backend, type Hero } from '../lib/backend.ts';
import { HEROES } from '../lib/heroes.ts';
import { HeroArt } from '../components/HeroArt.tsx';
import { Pager } from '../components/Pager.tsx';
import { PicturePad } from '../components/PicturePad.tsx';
import { NAME_ADJECTIVES, NAME_NOUNS, PICTURE_LENGTH, formatHeroCode } from '../../supabase/functions/_shared/kid-auth.ts';

type Step = 'grade' | 'hero' | 'name' | 'picture' | 'confirm' | 'card';
const STEPS: Step[] = ['grade', 'hero', 'name', 'picture', 'confirm'];

const pick = <T,>(list: readonly T[], n: number): T[] => [...list].sort(() => Math.random() - 0.5).slice(0, n);
const chunk = <T,>(list: T[], n: number): T[][] => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

function signUpMessage(e: unknown): string {
  if (!(e instanceof SignUpError)) return "Couldn't make your hero. Please try again.";
  switch (e.code) {
    case 'network': return "Couldn't reach the Nexus. Check your connection and try again.";
    case 'too_many_signups': return `Lots of heroes were made on this network just now. Try again in about ${Math.max(1, Math.round((e.retryAfter ?? 600) / 60))} minutes.`;
    case 'invalid_request': return 'Something in your choices was not accepted. Go back and pick again, or reload the app to get the newest version.';
    case 'signin_after_create': return `Your hero was made! Your secret code is ${formatHeroCode(e.heroCode ?? '')}. Write it down, then use "Switch hero" to sign in with your pictures.`;
    default: return 'The Nexus had a problem making your hero. Please try again in a minute.';
  }
}

export function Onboarding({ backend, onDone, onBack }: { backend: Backend; onDone: (h: Hero) => void; onBack: () => void }) {
  const [step, setStep] = useState<Step>('grade');
  const [grade, setGrade] = useState<5 | 6 | null>(null);
  const [heroId, setHeroId] = useState('ana');
  const [adjective, setAdjective] = useState<string>('');
  const [noun, setNoun] = useState<string>('');
  const [adjectives, setAdjectives] = useState(() => pick(NAME_ADJECTIVES, 8));
  const [nouns, setNouns] = useState(() => pick(NAME_NOUNS, 8));
  const [picture, setPicture] = useState<number[]>([]);
  const [again, setAgain] = useState<number[]>([]);
  const [hero, setHero] = useState<Hero | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const back = () => {
    const i = STEPS.indexOf(step);
    if (i <= 0) onBack();
    else setStep(STEPS[i - 1]);
  };

  const heroPages = useMemo(() => chunk(HEROES, 6), []);

  const create = async () => {
    setBusy(true);
    setError('');
    try {
      const h = await backend.signUp({ grade: grade!, hero: heroId, nameAdjective: adjective, nameNoun: noun, picture });
      setHero(h);
      setStep('card');
    } catch (e) {
      setError(signUpMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (step === 'card' && hero) return <HeroCard hero={hero} onDone={() => onDone(hero)} />;

  const progress = STEPS.indexOf(step) + 1;
  return (
    <main className="screen">
      <header className="bar">
        <button className="back" onClick={back} aria-label="Back">←</button>
        <div className="progress" aria-label={`Step ${progress} of ${STEPS.length}`}>
          {STEPS.map((s, i) => <span key={s} className={i < progress ? 'on' : ''} />)}
        </div>
      </header>

      {step === 'grade' && (
        <>
          <h2>What grade are you in?</h2>
          <div className="grade-row">
            {([5, 6] as const).map((g) => (
              <button key={g} className={`grade${grade === g ? ' chosen' : ''}`} onClick={() => setGrade(g)}>
                <span>{g}</span>th grade
              </button>
            ))}
          </div>
          <div className="grow" />
          <button className="btn primary" disabled={!grade} onClick={() => setStep('hero')}>Next</button>
        </>
      )}

      {step === 'hero' && (
        <>
          <h2>Choose your hero</h2>
          <div className="hero-pick">
            <Pager
              pages={heroPages.map((page) => (
                <div className="hero-grid">
                  {page.map((h) => (
                    <button key={h.id} className={`hero-card${heroId === h.id ? ' chosen' : ''}`} onClick={() => setHeroId(h.id)} aria-pressed={heroId === h.id}>
                      <HeroArt id={h.id} />
                      <span>{h.label}{h.squad && <i> ★</i>}</span>
                    </button>
                  ))}
                </div>
              ))}
            />
          </div>
          <p className="hint">Swipe to see more heroes. ★ = Ana's squad</p>
          <button className="btn primary" onClick={() => setStep('name')}>Pick this hero</button>
        </>
      )}

      {step === 'name' && (
        <>
          <h2>Pick your hero name</h2>
          <p className="name-preview">{adjective || '…'} {noun || '…'}</p>
          <div className="chips">{adjectives.map((a) => <button key={a} className={`chip${adjective === a ? ' chosen' : ''}`} onClick={() => setAdjective(a)}>{a}</button>)}</div>
          <div className="chips">{nouns.map((n) => <button key={n} className={`chip${noun === n ? ' chosen' : ''}`} onClick={() => setNoun(n)}>{n}</button>)}</div>
          <button className="btn ghost small" onClick={() => { setAdjectives(pick(NAME_ADJECTIVES, 8)); setNouns(pick(NAME_NOUNS, 8)); }}>🔀 Shuffle names</button>
          <div className="grow" />
          <button className="btn primary" disabled={!adjective || !noun} onClick={() => setStep('picture')}>Next</button>
        </>
      )}

      {step === 'picture' && (
        <>
          <h2>Make your secret pictures</h2>
          <p className="hint">Tap 4 pictures in an order you will remember. Don't tell anyone!</p>
          <PicturePad value={picture} onChange={setPicture} />
          <div className="grow" />
          <button className="btn primary" disabled={picture.length !== PICTURE_LENGTH} onClick={() => { setAgain([]); setStep('confirm'); }}>Next</button>
        </>
      )}

      {step === 'confirm' && (
        <ConfirmStep picture={picture} again={again} setAgain={setAgain} error={error} busy={busy} onCreate={create} />
      )}
    </main>
  );
}

function ConfirmStep({ picture, again, setAgain, error, busy, onCreate }: {
  picture: number[]; again: number[]; setAgain: (v: number[]) => void; error: string; busy: boolean; onCreate: () => void;
}) {
  const match = again.length === PICTURE_LENGTH && again.join() === picture.join();
  const miss = again.length === PICTURE_LENGTH && !match;
  useEffect(() => {
    if (miss) { const t = setTimeout(() => setAgain([]), 900); return () => clearTimeout(t); }
  }, [miss, setAgain]);
  return (
    <>
      <h2>Tap them again</h2>
      <p className="hint">{miss ? "Not quite. Let's try again!" : match ? 'Perfect! You remembered.' : 'Tap your 4 pictures in the same order.'}</p>
      <PicturePad value={again} onChange={setAgain} />
      <p className="error" role="alert">{error}</p>
      <div className="grow" />
      <button className="btn primary" disabled={!match || busy} onClick={onCreate}>{busy ? 'Making your hero…' : 'Create my hero'}</button>
    </>
  );
}

function HeroCard({ hero, onDone }: { hero: Hero; onDone: () => void }) {
  const [qr, setQr] = useState('');
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/?code=${hero.heroCode}`, { margin: 1, width: 360, color: { dark: '#0b0a24', light: '#ffffff' } }).then(setQr);
  }, [hero.heroCode]);
  return (
    <main className="screen center card-screen">
      <h2>Your Hero Card</h2>
      <div className="hero-id-card" id="hero-card">
        <HeroArt id={hero.starter} className="card-hero" />
        <div className="card-info">
          <strong>{hero.displayName}</strong>
          <span>Grade {hero.grade}</span>
          <code>{formatHeroCode(hero.heroCode)}</code>
          {qr && <img className="qr" src={qr} alt="QR code for your hero code" />}
        </div>
      </div>
      <p className="hint">Keep your code safe. Your secret pictures aren't on the card, so only you can get in. Ask a grown-up to print it or take a picture.</p>
      <div className="stack row">
        <button className="btn ghost" onClick={() => window.print()}>🖨 Print card</button>
        <button className="btn primary" onClick={onDone}>Enter the Nexus</button>
      </div>
    </main>
  );
}
