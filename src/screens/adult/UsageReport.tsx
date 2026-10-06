import { useEffect, useState } from 'react';
import type { Backend, UsageReport } from '../../lib/backend.ts';
import { ScreenBar } from '../../components/ScreenBar.tsx';
import { PagedList } from '../../components/PagedList.tsx';
import { GAMES } from '../Arcade.tsx';
import { SUBJECT_INFO } from '../Learn.tsx';
import { featureRows, gameRows, pctOf, peakHours, type UsageRow, type Verdict } from '../../lib/usage.ts';

type Tab = 'overview' | 'games' | 'other' | 'learning';
const TABS: { id: Tab; label: string }[] = [{ id: 'overview', label: 'Overview' }, { id: 'games', label: 'Games' }, { id: 'other', label: 'Other' }, { id: 'learning', label: 'Learning' }];
const VERDICT: Record<Verdict, string> = { keep: '✅ Keep', watch: '👀 Watch', hide: '🗑 Consider hiding', unknown: '⏳ Too early' };
const niceDay = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const monthName = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
const stats = (r: UsageRow) => `${r.opens} plays · ${r.players} kids · ${r.avgMinutes} min each${r.players ? ` · ${pctOf(r.cameBack, r.players)}% came back` : ''} · 👍 ${r.thumbs}`;

/** The Sensei's monthly report: counts only, no names. Least played games first so weak ones can be hidden. */
export function UsageReportScreen({ backend, onBack }: { backend: Backend; onBack: () => void }) {
  const [back, setBack] = useState(0);
  const [tab, setTab] = useState<Tab>('overview');
  const [mostFirst, setMostFirst] = useState(false);
  const [r, setR] = useState<UsageReport | null>(null);
  const [error, setError] = useState('');
  const load = () => backend.senseiUsageReport(back).then((x) => { setR(x); setError(''); }).catch(() => setError("Couldn't load the report."));
  useEffect(() => { setR(null); load(); }, [backend, back]); // eslint-disable-line react-hooks/exhaustive-deps

  const hide = async (row: UsageRow) => {
    try { await backend.senseiHideGame(row.id, !row.hidden); await load(); } catch { setError("Couldn't change that game."); }
  };

  const games = r ? gameRows(r, GAMES) : [];
  const features = r ? featureRows(r) : [];
  const shownGames = mostFirst ? [...games].reverse() : games;
  return (
    <main className="screen">
      <ScreenBar title="Monthly report" onBack={onBack} />
      <div className="chips" role="group" aria-label="Month">
        <button className={`chip${back === 0 ? ' chosen' : ''}`} onClick={() => setBack(0)}>This month</button>
        <button className={`chip${back === 1 ? ' chosen' : ''}`} onClick={() => setBack(1)}>Last month</button>
      </div>
      <div className="chips" role="tablist">
        {TABS.map((t) => <button key={t.id} role="tab" aria-selected={tab === t.id} className={`chip${tab === t.id ? ' chosen' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      <p className="error" role="alert">{error}</p>
      {!r ? <div className="spinner" /> : (
        <>
          {tab === 'overview' && (
            <>
              <div className="stat-grid">
                <div><b>{r.activeKids} / {r.heroesTotal}</b><small>Kids active</small></div>
                <div><b>{games.reduce((t, g) => t + g.opens, 0)}</b><small>Game plays</small></div>
                <div><b>{games.filter((g) => g.opens === 0).length}</b><small>Games nobody played</small></div>
                <div><b>{peakHours(r) || 'No data'}</b><small>Busiest times</small></div>
              </div>
              <div className="card">
                <b>How often kids come back</b>
                <small>{r.streaks.daily} kids came 7 or more days · {r.streaks.many} came 4 to 6 days</small>
                <small>{r.streaks.few} came 2 or 3 days · {r.streaks.one} came once</small>
                <small>{r.run3} kids came 3 days in a row at least once</small>
              </div>
              <div className="card">
                <b>Kids active each week</b>
                {r.weeks.length ? r.weeks.map((w) => <small key={w.week}>Week of {niceDay(w.week)}: {w.kids} kids</small>) : <small>Nothing yet this month.</small>}
              </div>
              <p className="hint">{r.since ? `Counting began ${niceDay(r.since)}, so earlier months stay empty.` : 'Counting starts when kids open games.'} Only totals are shown, never names.</p>
            </>
          )}
          {tab === 'games' && (
            <>
              <div className="chips">
                <button className={`chip${!mostFirst ? ' chosen' : ''}`} onClick={() => setMostFirst(false)}>Least played</button>
                <button className={`chip${mostFirst ? ' chosen' : ''}`} onClick={() => setMostFirst(true)}>Most played</button>
              </div>
              <PagedList items={shownGames} perPage={3} empty="No games yet."
                render={(g) => (
                  <div className="card" key={g.id}>
                    <div className="card-top"><b>{g.icon} {g.label}{g.hidden ? ' (hidden)' : ''}</b><span>{VERDICT[g.verdict]}</span></div>
                    <small className="muted">{stats(g)}</small>
                    <small className="muted">{g.why}{g.prevOpens ? ` · last month ${g.prevOpens} plays` : ''}</small>
                    <div className="card-bottom"><span />
                      <button className={`btn small ${g.hidden ? 'primary' : 'ghost'}`} onClick={() => hide(g)}>{g.hidden ? 'Show again' : 'Hide from Arcade'}</button>
                    </div>
                  </div>
                )} />
            </>
          )}
          {tab === 'other' && (
            <PagedList items={features} perPage={4} empty="No usage yet this month."
              render={(f) => (
                <div className="card report-row" key={f.id}>
                  <span>{f.icon} {f.label}</span>
                  <span>{f.opens} visits · {f.players} kids</span>
                </div>
              )} />
          )}
          {tab === 'learning' && (
            <PagedList items={r.subjects} perPage={4} empty="No practice answers this month."
              render={(s) => {
                const info = SUBJECT_INFO[s.subject as keyof typeof SUBJECT_INFO];
                return (
                  <div className="card report-row" key={s.subject}>
                    <span>{info?.icon ?? '📘'} {info?.label ?? s.subject}</span>
                    <span>{pctOf(s.correct, s.answered)}% right · {s.answered} answers</span>
                  </div>
                );
              }} />
          )}
          <div className="grow" />
          <button className="btn primary" onClick={() => window.print()}>🖨 Print this report</button>
          <div className="report-sheet print-only">
            <h2>HAHN Heroes monthly report: {monthName(r.month)}</h2>
            <p>{r.activeKids} of {r.heroesTotal} kids active · busiest times: {peakHours(r) || 'no data'} · printed {new Date().toLocaleDateString()}</p>
            <h3>Games, least played first</h3>
            <table>
              <thead><tr><th>Game</th><th>Plays</th><th>Kids</th><th>Min each</th><th>Came back</th><th>Suggestion</th></tr></thead>
              <tbody>{games.map((g) => <tr key={g.id}><td>{g.label}{g.hidden ? ' (hidden)' : ''}</td><td>{g.opens}</td><td>{g.players}</td><td>{g.avgMinutes}</td><td>{pctOf(g.cameBack, g.players)}%</td><td>{VERDICT[g.verdict].replace(/^\S+ /, '')}: {g.why}</td></tr>)}</tbody>
            </table>
            <h3>Other parts of the app</h3>
            <table>
              <thead><tr><th>Screen</th><th>Visits</th><th>Kids</th></tr></thead>
              <tbody>{features.map((f) => <tr key={f.id}><td>{f.label}</td><td>{f.opens}</td><td>{f.players}</td></tr>)}</tbody>
            </table>
            <h3>Practice accuracy</h3>
            <table>
              <thead><tr><th>Subject</th><th>Answers</th><th>Right</th></tr></thead>
              <tbody>{r.subjects.map((s) => <tr key={s.subject}><td>{SUBJECT_INFO[s.subject as keyof typeof SUBJECT_INFO]?.label ?? s.subject}</td><td>{s.answered}</td><td>{pctOf(s.correct, s.answered)}%</td></tr>)}</tbody>
            </table>
            <p>Counts only; no child is named. A suggestion needs at least 5 active kids.</p>
          </div>
        </>
      )}
    </main>
  );
}
