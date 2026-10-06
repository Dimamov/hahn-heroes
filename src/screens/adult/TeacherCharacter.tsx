import { useEffect, useState } from 'react';
import type { Backend, TeacherCharacter as Character } from '../../lib/backend.ts';
import { shrinkImage } from '../../lib/image-file.ts';
import { ScreenBar } from '../../components/ScreenBar.tsx';

/** A teacher's own character: send a photo and a wish list, then approve what the Sensei makes. Students only see the approved art, and only if the teacher chooses to show it. */
export function TeacherCharacter({ backend, onBack }: { backend: Backend; onBack: () => void }) {
  const [c, setC] = useState<Character | null>(null);
  const [wish, setWish] = useState('');
  const [photo, setPhoto] = useState('');
  const [note, setNote] = useState('');
  const [asking, setAsking] = useState(false);
  const [again, setAgain] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const load = () => backend.teacherCharacter().then((x) => { setC(x); setWish(x.wish); }).catch(() => setC({ status: 'none', wish: '', photo: null, art: null, artNote: '', changeNote: '', shown: false }));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError('');
    try { setPhoto(await shrinkImage(f, 1000)); } catch { setError('That file is not a picture. Pick a photo.'); }
  };
  const run = async (fn: () => Promise<void>, done: string) => {
    setError(''); setMsg('');
    try { await fn(); setMsg(done); setPhoto(''); setAsking(false); setAgain(false); setNote(''); await load(); }
    catch (e) { setError((e as Error).message || "That didn't work. Please try again."); }
  };

  if (!c) return <main className="screen center"><div className="spinner" /></main>;
  const busy = c.status === 'new';
  const sendable = c.status === 'none' || c.status === 'wish' || (c.status === 'approved' && again);
  return (
    <main className="screen scrolly">
      <ScreenBar title="My character" onBack={onBack} />
      {msg && <p className="note" role="status">{msg}</p>}
      {c.status === 'review' && c.art && (
        <>
          <img className="char-art" src={c.art} alt="Your character, drawn by the Sensei" />
          {c.artNote && <p className="note">Sensei: {c.artNote}</p>}
          {asking ? (
            <>
              <label className="field plain"><span>What should change?</span><input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} /></label>
              <div className="btn-grid">
                <button className="btn ghost" onClick={() => setAsking(false)}>Back</button>
                <button className="btn primary" disabled={!note.trim()} onClick={() => run(() => backend.teacherCharacterRespond(false, note), 'Sent back to the Sensei.')}>Send</button>
              </div>
            </>
          ) : (
            <div className="btn-grid">
              <button className="btn ghost" onClick={() => setAsking(true)}>Ask for changes</button>
              <button className="btn primary" onClick={() => run(() => backend.teacherCharacterRespond(true, ''), 'Approved! Your character is saved.')}>Approve</button>
            </div>
          )}
        </>
      )}
      {c.status === 'approved' && c.art && <img className="char-art" src={c.art} alt="Your approved character" />}
      {c.status === 'approved' && c.art && (
        <>
          <p className="hint">{c.shown ? 'Your class can see your character on their Class Missions page.' : 'Only you and the Sensei can see it right now.'}</p>
          <button className="btn ghost" onClick={() => run(() => backend.teacherCharacterShow(!c.shown), c.shown ? 'Hidden from your class.' : 'Your class can now see it.')}>
            {c.shown ? 'Hide from my class' : 'Show my character to my class'}
          </button>
        </>
      )}
      {busy && <p className="note" role="status">Sent! The Sensei is making your character and will send it back here for you to approve.</p>}
      {c.status === 'changes' && <p className="note" role="status">Your change request is with the Sensei: “{c.changeNote}”</p>}

      {sendable && (
        <>
          <p className="hint">Photo: a full-body shot with your face clearly visible, in good light. Only you and the Sensei can see it, and students never do.</p>
          {photo && <img className="char-photo" src={photo} alt="Your photo, ready to send" />}
          <input type="file" accept="image/*" onChange={(e) => pick(e.target.files?.[0])} aria-label="Choose a full-body photo" disabled={busy} />
        </>
      )}
      <label className="field plain"><span>Wish list: weapons or abilities you would like</span>
        <textarea value={wish} maxLength={600} rows={2} onChange={(e) => setWish(e.target.value)} disabled={c.status === 'review'} /></label>
      <p className="note">The Sensei reads your wish list when making your character and does their best, but it is a request, not a promise that every item will be included.</p>
      <p className="error" role="alert">{error}</p>
      {c.status === 'approved' && !again && <button className="btn ghost" onClick={() => setAgain(true)}>Request a new look</button>}
      {c.status !== 'review' && (
        <div className="btn-grid">
          <button className="btn ghost" disabled={wish === c.wish} onClick={() => run(() => backend.teacherCharacterWish(wish), 'Wish list saved.')}>Save wish list</button>
          <button className="btn primary" disabled={!photo || !sendable} onClick={() => run(() => backend.teacherCharacterSubmit(photo, wish), 'Sent to the Sensei.')}>Send photo</button>
        </div>
      )}
      {c.photo && c.status !== 'new' && (
        <button className="btn link" onClick={() => run(() => backend.teacherCharacterRemovePhoto(), 'Your photo was removed.')}>Remove my photo</button>
      )}
    </main>
  );
}
