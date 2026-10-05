import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { PagedList } from '../components/PagedList.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { SQUAD_WORDS, type Friends, type SquadView } from '../lib/backend.ts';

type Tab = 'squad' | 'friends' | 'add';
const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('no hero')) return "Hmm, no hero has that code. Check it and try again.";
  if (m.includes('own code')) return "That's your own code!";
  if (m.includes('already')) return 'You are already friends, or waiting for an answer.';
  if (m.includes('full')) return 'The squad is full (5 heroes).';
  return "That didn't work. Please try again.";
};

export function Squad() {
  const { backend, hero, go } = useSession();
  const [tab, setTab] = useState<Tab>('squad');
  const [friends, setFriends] = useState<Friends | null>(null);
  const [squad, setSquad] = useState<SquadView | null>(null);
  const [error, setError] = useState('');
  const load = useCallback(() => {
    backend.friends().then(setFriends).catch(() => setFriends({ friends: [], incoming: [], outgoing: [] }));
    backend.mySquad().then(setSquad).catch(() => setSquad({ squad: null, invites: [] }));
  }, [backend]);
  useEffect(() => { load(); }, [load]);
  const run = async (fn: () => Promise<unknown>) => { setError(''); try { await fn(); } catch (e) { setError(errText(e)); } load(); };

  const waiting = (friends?.incoming.length ?? 0) + (squad?.invites.length ?? 0);
  return (
    <main className="screen">
      <ScreenBar title="Squad" onBack={() => go('home')} />
      <div className="chips">
        <button className={`chip${tab === 'squad' ? ' chosen' : ''}`} onClick={() => setTab('squad')}>My squad</button>
        <button className={`chip${tab === 'friends' ? ' chosen' : ''}`} onClick={() => setTab('friends')}>Friends{waiting > 0 ? ` (${waiting})` : ''}</button>
        <button className={`chip${tab === 'add' ? ' chosen' : ''}`} onClick={() => setTab('add')}>Add</button>
      </div>
      <p className="error" role="alert">{error}</p>
      {tab === 'squad' && <SquadTab squad={squad} friends={friends} run={run} backend={backend} />}
      {tab === 'friends' && <FriendsTab friends={friends} squad={squad} run={run} backend={backend} />}
      {tab === 'add' && <AddTab code={hero.heroCode} backend={backend} onSent={load} />}
    </main>
  );
}

type Run = (fn: () => Promise<unknown>) => Promise<void>;
type B = ReturnType<typeof useSession>['backend'];

function SquadTab({ squad, friends, run, backend }: { squad: SquadView | null; friends: Friends | null; run: Run; backend: B }) {
  const [adj, setAdj] = useState(SQUAD_WORDS.adjectives[0]);
  const [noun, setNoun] = useState(SQUAD_WORDS.nouns[0]);
  if (!squad) return <div className="spinner" />;
  const s = squad.squad;
  if (!s) {
    return (
      <>
        {squad.invites.map((i) => (
          <div className="card" key={i.squadId}>
            <div className="card-top"><b>{i.name}</b></div>
            <small className="muted">{i.leaderName} invited you to join!</small>
            <div className="card-bottom"><span />
              <span className="row">
                <button className="btn small ghost" onClick={() => run(() => backend.respondSquadInvite(i.squadId, false))}>No thanks</button>
                <button className="btn small primary" onClick={() => run(() => backend.respondSquadInvite(i.squadId, true))}>Join</button>
              </span>
            </div>
          </div>
        ))}
        <p className="hint">You are not in a squad yet. Start one and invite your friends!</p>
        <Stepper label="First word" words={SQUAD_WORDS.adjectives} value={adj} onChange={setAdj} />
        <Stepper label="Second word" words={SQUAD_WORDS.nouns} value={noun} onChange={setNoun} />
        <div className="grow" />
        <button className="btn primary" onClick={() => run(() => backend.createSquad(adj, noun))}>Start the {adj} {noun}</button>
      </>
    );
  }
  const taken = new Set(s.members.map((m) => m.heroId));
  const canInvite = s.leader ? (friends?.friends ?? []).filter((f) => !taken.has(f.heroId)) : [];
  return (
    <>
      <h3 className="center-text">👥 {s.name}</h3>
      <PagedList items={s.members} perPage={4} empty="Just you so far."
        render={(m) => (
          <div className="card member" key={m.heroId}>
            <HeroArt id={m.starter} className="chip-hero" />
            <span><b>{m.name}</b>{m.isLeader && ' 👑'}<small className="muted"> {m.status === 'invited' ? 'invited' : ''}</small></span>
          </div>
        )} />
      <div className="grow" />
      {s.leader && canInvite.length > 0 && (
        <div className="chips">
          {canInvite.slice(0, 3).map((f) => <button key={f.id} className="chip" onClick={() => run(() => backend.inviteToSquad(f.heroId))}>➕ {f.name}</button>)}
        </div>
      )}
      <button className="btn ghost" onClick={() => run(() => backend.leaveSquad())}>{s.leader ? 'Disband squad' : 'Leave squad'}</button>
    </>
  );
}

function FriendsTab({ friends, squad, run, backend }: { friends: Friends | null; squad: SquadView | null; run: Run; backend: B }) {
  void squad;
  if (!friends) return <div className="spinner" />;
  return (
    <>
      {friends.incoming.map((r) => (
        <div className="card" key={r.id}>
          <div className="card-top"><b>{r.name}</b><small className="muted">Grade {r.grade}</small></div>
          <small className="muted">wants to be your friend</small>
          <div className="card-bottom"><span />
            <span className="row">
              <button className="btn small ghost" onClick={() => run(() => backend.respondFriend(r.id, false))}>No thanks</button>
              <button className="btn small primary" onClick={() => run(() => backend.respondFriend(r.id, true))}>Accept</button>
            </span>
          </div>
        </div>
      ))}
      <PagedList items={friends.friends} perPage={friends.incoming.length ? 2 : 4} empty="No friends yet. Use Add to send a request with your friend's hero code."
        render={(f) => (
          <div className="card member" key={f.id}>
            <HeroArt id={f.starter} className="chip-hero" />
            <span><b>{f.name}</b><small className="muted"> Grade {f.grade}</small></span>
            <button className="btn small ghost" onClick={() => run(() => backend.removeFriend(f.id))}>Remove</button>
          </div>
        )} />
      {friends.outgoing.length > 0 && <p className="note">Waiting for: {friends.outgoing.map((o) => o.name).join(', ')}</p>}
    </>
  );
}

function AddTab({ code, backend, onSent }: { code: string; backend: B; onSent: () => void }) {
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState('');
  const [bad, setBad] = useState(false);
  const send = async () => {
    try { const name = await backend.requestFriend(value); setMsg(`Request sent to ${name}!`); setBad(false); setValue(''); onSent(); }
    catch (e) { setMsg(errText(e)); setBad(true); }
  };
  return (
    <>
      <p className="hint">Your hero code. Share it with a friend so they can add you:</p>
      <div className="big-code"><b>{code}</b></div>
      <label className="field plain"><span>Your friend's hero code</span>
        <input value={value} maxLength={8} autoCapitalize="characters" onChange={(e) => setValue(e.target.value.toUpperCase())} />
      </label>
      <p className={bad ? 'error' : 'hint'} role="status">{msg}</p>
      <div className="grow" />
      <button className="btn primary" disabled={value.length < 8} onClick={send}>Send friend request</button>
    </>
  );
}

function Stepper({ label, words, value, onChange }: { label: string; words: string[]; value: string; onChange: (w: string) => void }) {
  const i = words.indexOf(value);
  const step = (d: number) => onChange(words[(i + d + words.length) % words.length]);
  return (
    <div className="stepper" aria-label={label}>
      <button className="btn small ghost" onClick={() => step(-1)} aria-label={`Previous ${label}`}>◀</button>
      <b>{value}</b>
      <button className="btn small ghost" onClick={() => step(1)} aria-label={`Next ${label}`}>▶</button>
    </div>
  );
}
