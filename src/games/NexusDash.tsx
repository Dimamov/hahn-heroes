import { useEffect, useRef, useState } from 'react';
import { GameFrame, WinPanel } from './GameFrame.tsx';
import { useSession } from '../App.tsx';
import { beep } from '../lib/sound.ts';
import {
  DASH_WIN, GROUND, H, HERO_W, HERO_X, RUNNERS, TRAILS, W, heroHeight, jump, newState, onGround, score, slide, step, unlocked,
  type DashState, type RunnerId, type TrailId,
} from '../lib/dash.ts';

interface Saved { best: number; runner: RunnerId; trail: TrailId }
const SCALE = 4;
const load = (key: string): Saved => {
  try { return { best: 0, runner: 'runner', trail: 'spark', ...JSON.parse(localStorage.getItem(key) ?? '{}') }; } catch { return { best: 0, runner: 'runner', trail: 'spark' }; }
};
const save = (key: string, v: Saved) => { try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* blocked storage */ } };

interface Spark { x: number; y: number; age: number; seed: number }

/** Side-scrolling runner. Jump the shadow traps, slide under the energy barriers, grab power-ups. */
export function NexusDash() {
  const { hero } = useSession();
  const key = `hh-dash-${hero.id}`;
  const [saved, setSaved] = useState<Saved>(() => load(key));
  const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready');
  const [final, setFinal] = useState({ score: 0, newBest: false, unlockedNow: [] as string[] });
  const state = useRef<DashState>(newState());
  const sparks = useRef<Spark[]>([]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const runner = RUNNERS.find((r) => r.id === saved.runner) ?? RUNNERS[0];

  const start = () => { state.current = newState(); sparks.current = []; setPhase('play'); };
  const choose = (patch: Partial<Saved>) => { const next = { ...saved, ...patch }; setSaved(next); save(key, next); };

  useEffect(() => {
    if (phase !== 'play') return;
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    let raf = 0, last = performance.now(), flashSound = 0;
    const frame = (now: number) => {
      const s = state.current;
      const dt = Math.min(0.033, (now - last) / 1000);
      last = now;
      const wasShield = s.shield, coins = s.coins;
      step(s, dt);
      if (s.coins > coins) beep(880, 50, 'triangle');
      if (wasShield && !s.shield && !s.over) beep(300, 120, 'triangle');
      // trail: a new spark each frame, older ones drift back and fade
      const hh = heroHeight(s);
      sparks.current.push({ x: HERO_X, y: s.bottom - hh / 2, age: 0, seed: Math.random() });
      sparks.current = sparks.current.filter((p) => (p.age += dt) < 0.5);
      draw(ctx, s, sparks.current, saved.trail, runner.id, now / 1000);
      if (s.over) {
        const sc = score(s);
        const before = saved.best;
        const best = Math.max(before, sc);
        const now2 = [...RUNNERS, ...TRAILS].filter((u) => u.need > before && u.need <= best).map((u) => u.name);
        if (best > before) { const next = { ...saved, best }; setSaved(next); save(key, next); }
        setFinal({ score: sc, newBest: sc > before && before > 0, unlockedNow: now2 });
        beep(180, 300, 'sawtooth');
        setPhase('over');
        return;
      }
      void flashSound;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'ArrowUp' || e.key === 'w') { e.preventDefault(); jump(state.current); }
      if (e.key === 'ArrowDown' || e.key === 's') { e.preventDefault(); slide(state.current); }
    };
    window.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Swipe up to jump, swipe down to slide, tap to jump.
  const touch = useRef<{ y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { touch.current = { y: e.clientY }; };
  const onUp = (e: React.PointerEvent) => {
    const t = touch.current; touch.current = null;
    if (!t) return;
    const dy = e.clientY - t.y;
    if (dy > 24) slide(state.current); else jump(state.current);
  };

  if (phase === 'over' && final.score >= DASH_WIN) {
    return <GameFrame title="Nexus Dash"><WinPanel game="nexus-dash" message={`${final.score} points! ${final.unlockedNow.length ? 'Unlocked: ' + final.unlockedNow.join(', ') : ''}`} onAgain={start} /></GameFrame>;
  }
  if (phase === 'over') {
    return (
      <GameFrame title="Nexus Dash">
        <div className="grow" />
        <div className="soon-icon" aria-hidden>{runner.icon}</div>
        <h3>{final.score} points</h3>
        <p className="hint">Best: {saved.best}. Get {DASH_WIN} to win the daily reward.{final.unlockedNow.length ? ` Unlocked: ${final.unlockedNow.join(', ')}!` : ''}</p>
        <div className="grow" />
        <div className="btn-grid">
          <button className="btn ghost" onClick={() => setPhase('ready')}>Style</button>
          <button className="btn primary" onClick={start}>Run again</button>
        </div>
      </GameFrame>
    );
  }
  if (phase === 'ready') {
    return (
      <GameFrame title="Nexus Dash" hint="Tap or swipe up to jump the shadow traps. Swipe down to slide under energy barriers. Grab 🛡️ and ⚡!">
        <p className="note">Best: {saved.best} · reach {DASH_WIN} for the daily reward</p>
        <div className="chips" role="group" aria-label="Runner">
          {RUNNERS.map((r) => (
            <button key={r.id} className={`chip${saved.runner === r.id ? ' chosen' : ''}`} disabled={!unlocked(r.need, saved.best)} onClick={() => choose({ runner: r.id })}>
              {unlocked(r.need, saved.best) ? r.icon : '🔒'} {unlocked(r.need, saved.best) ? r.name : r.need}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Trail">
          {TRAILS.map((t) => (
            <button key={t.id} className={`chip${saved.trail === t.id ? ' chosen' : ''}`} disabled={!unlocked(t.need, saved.best)} onClick={() => choose({ trail: t.id })}>
              {unlocked(t.need, saved.best) ? t.icon : '🔒'} {unlocked(t.need, saved.best) ? t.name : t.need}
            </button>
          ))}
        </div>
        <div className="grow" />
        <button className="btn primary" onClick={start}>Run!</button>
      </GameFrame>
    );
  }
  return (
    <GameFrame title="Nexus Dash" onExit={() => setPhase('ready')}>
      <div className="dash-stage" onPointerDown={onDown} onPointerUp={onUp}>
        <canvas ref={canvas} className="dash-canvas" width={W * SCALE} height={H * SCALE} aria-label="Nexus Dash game" />
      </div>
      <div className="dash-pads">
        <button className="btn dash-pad" onPointerDown={(e) => { e.stopPropagation(); slide(state.current); }}>⬇ Slide</button>
        <button className="btn primary dash-pad" onPointerDown={(e) => { e.stopPropagation(); jump(state.current); }}>⬆ Jump</button>
      </div>
    </GameFrame>
  );
}

function draw(ctx: CanvasRenderingContext2D, s: DashState, sparks: Spark[], trail: TrailId, runnerId: RunnerId, t: number) {
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, s.surge > 0 ? '#3b1d6e' : '#1b1650'); g.addColorStop(1, '#0b0a24');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // far stars drift slowly
  ctx.fillStyle = '#ffffff55';
  for (let i = 0; i < 14; i++) { const x = ((i * 37 - s.distance * 0.15) % W + W) % W; ctx.fillRect(x, (i * 13) % 40 + 4, 1, 1); }
  ctx.fillStyle = '#2a2470'; ctx.fillRect(0, GROUND, W, H - GROUND);
  ctx.fillStyle = '#7c6cf0'; ctx.fillRect(0, GROUND, W, 1);
  for (let i = 0; i < 10; i++) { const x = ((i * 20 - s.distance) % W + W) % W; ctx.fillStyle = '#3b3392'; ctx.fillRect(x, GROUND + 6, 8, 1); }

  // trail
  for (const p of sparks) {
    const k = 1 - p.age / 0.5, x = p.x - p.age * s.speed * 0.9;
    if (trail === 'rainbow') { ctx.fillStyle = `hsl(${(p.age * 700 + t * 60) % 360} 90% 60% / ${k})`; ctx.fillRect(x, p.y - 2 + Math.sin(p.age * 20) * 1.5, 3, 3); }
    else if (trail === 'flame') { ctx.fillStyle = `hsl(${10 + p.seed * 40} 95% 55% / ${k})`; ctx.beginPath(); ctx.arc(x, p.y + p.age * 8 - p.seed * 3, 2.2 * k + 0.5, 0, 7); ctx.fill(); }
    else if (trail === 'lightning') { ctx.strokeStyle = `rgba(253,224,71,${k})`; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, p.y - 3); ctx.lineTo(x + 2, p.y); ctx.lineTo(x - 1, p.y + 1); ctx.lineTo(x + 1, p.y + 4); ctx.stroke(); }
    else { ctx.fillStyle = `rgba(34,211,238,${k})`; ctx.fillRect(x, p.y + (p.seed - 0.5) * 6, 2, 2); }
  }

  // obstacles
  for (const o of s.obstacles) {
    if (o.kind === 'trap') {
      ctx.fillStyle = '#6d28d9';
      ctx.beginPath(); ctx.moveTo(o.x, GROUND); ctx.lineTo(o.x + o.w * 0.25, o.top); ctx.lineTo(o.x + o.w * 0.5, GROUND); ctx.lineTo(o.x + o.w * 0.75, o.top); ctx.lineTo(o.x + o.w, GROUND); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f0abfc'; ctx.fillRect(o.x + o.w * 0.2, o.top + 3, 1.2, 1.2); ctx.fillRect(o.x + o.w * 0.65, o.top + 3, 1.2, 1.2);
    } else {
      ctx.fillStyle = '#22d3ee'; ctx.fillRect(o.x, o.top, o.w, o.h);
      ctx.fillStyle = '#ecfeff'; ctx.fillRect(o.x, o.top + 2, o.w, 1);
      ctx.fillStyle = '#0891b2'; ctx.fillRect(o.x - 1, o.top - 1, 2, o.h + 2); ctx.fillRect(o.x + o.w - 1, o.top - 1, 2, o.h + 2);
    }
  }
  // pickups
  for (const p of s.pickups) {
    if (p.kind === 'coin') { ctx.fillStyle = '#fbbf24'; ctx.beginPath(); ctx.arc(p.x + 2.5, p.bottom - 2.5, 2.2, 0, 7); ctx.fill(); ctx.fillStyle = '#fde68a'; ctx.fillRect(p.x + 2, p.bottom - 4, 1, 3); }
    else { ctx.font = '7px system-ui'; ctx.textBaseline = 'bottom'; ctx.fillText(p.kind === 'shield' ? '🛡️' : '⚡', p.x - 1, p.bottom + 1); }
  }

  // hero: drawn here (not an emoji, whose facing differs by phone) so every runner faces right, the way the track moves
  const hh = heroHeight(s);
  const running = onGround(s) && s.slide <= 0;
  ctx.save();
  ctx.translate(HERO_X + HERO_W / 2, s.bottom);
  if (s.flash > 0 || s.surge > 0) ctx.globalAlpha = 0.65 + 0.35 * Math.sin(t * 12);
  drawRunner(ctx, runnerId, hh, running, s.slide > 0, t);
  ctx.restore();
  if (s.shield) { ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 0.8; ctx.beginPath(); ctx.arc(HERO_X + 3, s.bottom - hh / 2, 9, 0, 7); ctx.stroke(); }

  // score
  ctx.fillStyle = '#fff'; ctx.font = '6px system-ui'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
  ctx.fillText(`${score(s)}`, 4, 3);
  ctx.textAlign = 'right';
  ctx.fillText(`${s.shield ? '🛡️ ' : ''}${s.surge > 0 ? '⚡' + Math.ceil(s.surge) : ''}`, W - 4, 3);
}

/** A small runner facing right. (0, 0) is the middle of the feet; the body is about `h` tall and 6 wide. */
function drawRunner(ctx: CanvasRenderingContext2D, id: RunnerId, h: number, running: boolean, sliding: boolean, t: number) {
  const look = {
    runner: { body: '#38bdf8', head: '#fcd9b6', accent: '#f43f5e' },
    fox: { body: '#fb923c', head: '#fdba74', accent: '#fff7ed' },
    ninja: { body: '#1f2937', head: '#1f2937', accent: '#ef4444' },
    robot: { body: '#94a3b8', head: '#cbd5e1', accent: '#22d3ee' },
  }[id];
  // legs swing while running, tuck while jumping, and the whole body lies flat while sliding
  const swing = running ? Math.sin(t * 16) * 2 : 0;
  if (sliding) {
    ctx.fillStyle = look.body; ctx.fillRect(-4, -h, 9, h);
    ctx.fillStyle = look.head; ctx.fillRect(2, -h, 4, h - 1);
    ctx.fillStyle = look.accent; ctx.fillRect(4, -h + 1, 1.2, 1.2);
    return;
  }
  const legTop = -h * 0.35;
  ctx.strokeStyle = look.body; ctx.lineWidth = 1.6; ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-0.6, legTop); ctx.lineTo(-0.6 + swing, running ? -0.3 : -1.5);
  ctx.moveTo(0.8, legTop); ctx.lineTo(0.8 - swing, running ? -0.3 : -3);
  ctx.stroke();
  // body leans a little forward (to the right)
  ctx.fillStyle = look.body;
  ctx.beginPath(); ctx.moveTo(-2, legTop); ctx.lineTo(2.4, legTop); ctx.lineTo(2.9, -h * 0.72); ctx.lineTo(-1.6, -h * 0.72); ctx.closePath(); ctx.fill();
  // head, looking right
  const hy = -h * 0.72 - 2.4;
  ctx.fillStyle = look.head; ctx.beginPath(); ctx.arc(1.4, hy, 2.6, 0, 7); ctx.fill();
  ctx.fillStyle = look.accent;
  if (id === 'runner') { ctx.fillRect(-1.6, hy - 1.6, 5.8, 1); ctx.fillRect(-3, hy - 1.2, 1.6, 0.8); }
  if (id === 'fox') { ctx.fillStyle = look.head; ctx.beginPath(); ctx.moveTo(-0.2, hy - 1.5); ctx.lineTo(0.2, hy - 4.6); ctx.lineTo(1.6, hy - 2.2); ctx.fill(); ctx.beginPath(); ctx.moveTo(2, hy - 2); ctx.lineTo(3.3, hy - 4.4); ctx.lineTo(3.8, hy - 1.2); ctx.fill(); ctx.fillStyle = look.body; ctx.fillRect(-4.2, legTop - 1 + swing * 0.3, 2.6, 1.4); ctx.fillStyle = look.accent; ctx.fillRect(-4.2, legTop - 1 + swing * 0.3, 0.8, 1.4); ctx.fillStyle = '#111'; ctx.fillRect(3.4, hy - 0.2, 1, 1); }
  if (id === 'ninja') { ctx.fillStyle = '#e5e7eb'; ctx.fillRect(1.2, hy - 0.8, 3, 1.2); ctx.fillStyle = look.accent; ctx.fillRect(-3.2, hy - 0.6 + swing * 0.2, 2.2, 0.8); }
  if (id === 'robot') { ctx.fillRect(2.6, hy - 0.6, 1.6, 1.2); ctx.fillStyle = look.accent; ctx.fillRect(1.2, hy - 4.4, 0.7, 1.8); ctx.beginPath(); ctx.arc(1.55, hy - 4.6, 0.8, 0, 7); ctx.fill(); }
  if (id === 'runner') { ctx.fillStyle = '#111'; ctx.fillRect(3, hy - 0.2, 0.9, 0.9); }
}
