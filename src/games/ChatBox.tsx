import { useEffect, useRef, useState } from 'react';
import { useSession } from '../App.tsx';
import type { ChatMessage } from '../lib/backend.ts';

const NOTES = {
  warning: 'Please keep chat friendly. One more and chat is paused.',
  banned: 'Chat is paused. A grown-up can ask the Sensei to unlock it.',
  private: 'Keep names, numbers and links to yourself.',
  slow: 'Slow down a little!',
  no_class: 'Chat opens when you join your teacher\'s class. Ask your teacher for the class code.',
} as const;

/** A small chat for a game room. A button opens a sheet; the server filters every message. */
export function ChatButton() {
  const { backend } = useSession();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [banned, setBanned] = useState(false);
  const [canChat, setCanChat] = useState(true);
  const [seen, setSeen] = useState(0);
  const [text, setText] = useState('');
  const [note, setNote] = useState('');

  useEffect(() => {
    let alive = true;
    const load = () => backend.chatRead().then((d) => { if (alive) { setMessages(d.messages); setBanned(d.banned); setCanChat(d.canChat); } }).catch(() => undefined);
    load();
    const id = setInterval(load, 2000);
    return () => { alive = false; clearInterval(id); };
  }, [backend]);

  const last = messages.length ? messages[messages.length - 1].id : 0;
  useEffect(() => { if (open) setSeen(last); }, [open, last]);
  const unread = !open && messages.some((m) => !m.me && m.id > seen);

  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => { listRef.current?.scrollTo({ top: 1e6 }); }, [messages, open]);

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    try {
      const r = await backend.chatSend(body);
      setNote(r.ok ? '' : NOTES[r.reason]);
      if (!r.ok && r.reason === 'banned') setBanned(true);
      if (r.ok) setMessages((await backend.chatRead()).messages);
    } catch { setNote("Couldn't send that."); }
  };

  return (
    <>
      <button className="btn small ghost chat-btn" onClick={() => setOpen(true)} aria-label="Open chat">
        💬{unread && <i className="red-dot" aria-label="New messages" />}
      </button>
      {open && (
        <div className="chat-sheet" role="dialog" aria-label="Room chat">
          <header className="bar">
            <button className="back" onClick={() => setOpen(false)} aria-label="Close chat">✕</button>
            <h2>Room chat</h2>
          </header>
          <div className="chat-list" ref={listRef}>
            {messages.length === 0 && <p className="note">Say hi! Be kind and keep it short.</p>}
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg${m.me ? ' me' : ''}`}><small>{m.me ? 'You' : m.name}</small><span>{m.body}</span></div>
            ))}
          </div>
          <p className="error" role="alert">{banned ? '' : note}</p>
          {!canChat
            ? <p className="hint">{NOTES.no_class}</p>
            : banned
            ? <p className="hint">{NOTES.banned}</p>
            : (
              <form className="chat-form" onSubmit={(e) => { e.preventDefault(); send(); }}>
                <input value={text} maxLength={80} placeholder="Type a message" onChange={(e) => setText(e.target.value)} aria-label="Message" />
                <button className="btn small primary" type="submit" disabled={!text.trim()}>Send</button>
              </form>
            )}
        </div>
      )}
    </>
  );
}
