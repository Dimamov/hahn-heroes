import { useEffect, useState } from 'react';
import type { Backend, StudentQuestion } from '../lib/backend.ts';

const errText = (e: unknown) => {
  const m = e instanceof Error ? e.message : '';
  if (m.includes('different words')) return 'Please pick different words.';
  if (m.includes('links')) return 'Please leave out links and contact details.';
  if (m.includes('all your questions')) return 'That is all your questions for this week. Come back next week!';
  if (m.includes('5 to 200')) return 'Write your question in 5 to 200 letters.';
  return "That didn't work. Please try again.";
};
const STATUS = { pending: '⏳ Waiting for your teacher', approved: '✅ Picked!', rejected: 'Not this time' } as const;

/** Students write a quiz question for their class. The teacher approves it first. */
export function WriteQuestion({ backend }: { backend: Backend }) {
  const [open, setOpen] = useState(false);
  const [mine, setMine] = useState<StudentQuestion[]>([]);
  const [prompt, setPrompt] = useState('');
  const [choices, setChoices] = useState(['', '', '']);
  const [right, setRight] = useState(0);
  const [why, setWhy] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const load = () => backend.studentQMine().then(setMine).catch(() => setMine([]));
  useEffect(() => { void load(); }, [backend]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async () => {
    setError('');
    try {
      await backend.studentQSubmit(prompt, choices.filter((c) => c.trim()), right, why);
      setPrompt(''); setChoices(['', '', '']); setWhy(''); setRight(0); setSent(true); setOpen(false); await load();
    } catch (e) { setError(errText(e)); }
  };
  const filled = choices.filter((c) => c.trim()).length;
  return (
    <section className="card goal-card">
      <b>✏️ Write a question for the class</b>
      {sent && !open && <p className="note">Sent! Your teacher will look at it.</p>}
      {!open ? <button className="btn" onClick={() => { setSent(false); setOpen(true); }}>Write one</button> : (
        <>
          <input className="live-input" placeholder="Your question" maxLength={200} value={prompt} onChange={(e) => setPrompt(e.target.value)} aria-label="Your question" />
          {choices.map((c, i) => (
            <div className="choice-edit" key={i}>
              <input type="radio" name="right" checked={right === i} onChange={() => setRight(i)} aria-label={`Answer ${i + 1} is right`} />
              <input placeholder={`Answer ${i + 1}${right === i ? ' (the right one)' : ''}`} maxLength={60} value={c} onChange={(e) => setChoices(choices.map((x, j) => (j === i ? e.target.value : x)))} />
            </div>
          ))}
          {choices.length < 4 && <button className="btn small ghost" onClick={() => setChoices([...choices, ''])}>＋ Add a 4th answer</button>}
          <input className="live-input" placeholder="Why is it right? (optional)" maxLength={200} value={why} onChange={(e) => setWhy(e.target.value)} aria-label="Why is it right" />
          <p className="error" role="alert">{error}</p>
          <button className="btn primary" disabled={prompt.trim().length < 5 || filled < 3 || !choices[right].trim()} onClick={send}>Send to my teacher</button>
        </>
      )}
      {mine.slice(0, 4).map((q) => <small key={q.id} className="muted">{q.prompt.slice(0, 40)}… {STATUS[q.status]}</small>)}
    </section>
  );
}
