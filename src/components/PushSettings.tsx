import { useEffect, useState } from 'react';
import type { Backend, PushPrefs } from '../lib/backend.ts';
import { PUSH_KINDS, deviceSubscription, disablePush, enablePush, pushSupport } from '../lib/push.ts';

type State =
  | { name: 'loading' }
  | { name: 'not-set-up' }
  | { name: 'needs-install' }
  | { name: 'unsupported' }
  | { name: 'blocked' }
  | { name: 'off'; key: string }
  | { name: 'on'; key: string; prefs: PushPrefs };

/** Opt-in for push notifications, with one switch per kind of message and quiet hours. */
export function PushSettings({ backend, role }: { backend: Backend; role: 'kid' | 'parent' }) {
  const [state, setState] = useState<State>({ name: 'loading' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const k = await backend.pushKey().catch(() => ({ configured: false, key: null }));
    if (!k.configured || !k.key) { setState({ name: 'not-set-up' }); return; }
    const support = pushSupport();
    if (support === 'needs-install') { setState({ name: 'needs-install' }); return; }
    if (support === 'unsupported') { setState({ name: 'unsupported' }); return; }
    if (Notification.permission === 'denied') { setState({ name: 'blocked' }); return; }
    const sub = await deviceSubscription();
    const prefs = sub ? await backend.pushPrefs().catch(() => null) : null;
    setState(sub && prefs ? { name: 'on', key: k.key, prefs } : { name: 'off', key: k.key });
  };
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const turnOn = async (key: string) => {
    setBusy(true); setError('');
    try { await enablePush(backend, key); await load(); }
    catch (e) {
      if ((e as Error).message === 'denied') { setState({ name: 'blocked' }); }
      else setError("That didn't work. Please try again.");
    } finally { setBusy(false); }
  };
  const turnOff = async () => {
    setBusy(true); setError('');
    try { await disablePush(backend); await load(); } finally { setBusy(false); }
  };
  const toggle = async (key: keyof PushPrefs, value: boolean) => {
    if (state.name !== 'on') return;
    setState({ ...state, prefs: { ...state.prefs, [key]: value } });
    try { await backend.pushSetPrefs({ [key]: value }); }
    catch { setError("That didn't save. Please try again."); await load(); }
  };

  if (state.name === 'loading') return <div className="spinner" />;
  if (state.name === 'not-set-up') {
    return <div className="card" role="status"><b>🔔 Notifications are not set up yet</b><p className="hint">The Sensei is still getting them ready. Check back soon!</p></div>;
  }
  if (state.name === 'needs-install') {
    return (
      <div className="card" role="status">
        <b>🔔 Add the app to your home screen first</b>
        <p className="hint">On an iPhone or iPad, notifications only work after you add HAHN Heroes to your home screen. Tap the Share button, then "Add to Home Screen", then open the app from there and come back here.</p>
      </div>
    );
  }
  if (state.name === 'unsupported') {
    return <div className="card" role="status"><b>🔔 This device cannot get notifications</b><p className="hint">Try the app on a phone or tablet where it is added to the home screen.</p></div>;
  }
  if (state.name === 'blocked') {
    return <div className="card" role="status"><b>🔔 Notifications are blocked</b><p className="hint">They were turned off in this browser's settings. A grown-up can turn them back on there, then open this page again.</p></div>;
  }
  if (state.name === 'off') {
    return (
      <div className="push-box">
        <div className="card">
          <b>🔔 Get a quick heads-up</b>
          <p className="hint">{role === 'kid'
            ? 'Hero alerts tell you when a chore is accepted, when Trivia Night is about to start, and when the Sensei has a message. Ask a grown-up before you turn them on.'
            : 'Get a heads-up when a chore is waiting for you and a weekly summary. Nothing is sent at night, and messages never include your child\'s name.'}</p>
        </div>
        <button className="btn primary" disabled={busy} onClick={() => turnOn(state.key)}>Turn on notifications</button>
        <p className="error" role="alert">{error}</p>
      </div>
    );
  }
  return (
    <div className="push-box">
      <div className="card">
        <b>🔔 Notifications are on</b>
        <div className="toggles">
          {PUSH_KINDS[role].map((k) => (
            <label className="toggle" key={k.key}>
              <input type="checkbox" checked={state.prefs[k.key]} onChange={(e) => toggle(k.key, e.target.checked)} />
              <span>{k.label}</span>
            </label>
          ))}
          <label className="toggle">
            <input type="checkbox" checked={state.prefs.quiet_hours} onChange={(e) => toggle('quiet_hours', e.target.checked)} />
            <span>Quiet at night (9 pm to 7 am)</span>
          </label>
        </div>
      </div>
      <button className="btn ghost" disabled={busy} onClick={turnOff}>Turn off on this device</button>
      <p className="error" role="alert">{error}</p>
    </div>
  );
}
