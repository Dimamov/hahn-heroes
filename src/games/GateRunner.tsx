import { useEffect, useRef, useState } from 'react';
import { GameFrame, WinPanel } from './GameFrame.tsx';
import { useSession } from '../App.tsx';
import { beep, isQuiet } from '../lib/sound.ts';
import { shake } from '../lib/fx.ts';
import {
  CX, GATE_WIN, H, HEARTS, HORIZON, PLAYER_Y, W, laneX, move, multiplier, newState, proj, step,
  type GateState,
} from '../lib/gate.ts';

const SCALE = 2;
const ART = '/assets/games/gate-runner';
const FONT = '"Baloo 2", system-ui, sans-serif';
const C = { gate: '#36e2ff', gold: '#ffd166', ember: '#ff4d8d', portal: '#8b5cff', ink: '#efe9ff', void: '#0b0717' };

const loadBest = (key: string) => { try { return Number(localStorage.getItem(key)) || 0; } catch { return 0; } };
const saveBest = (key: string, v: number) => { try { localStorage.setItem(key, String(v)); } catch { /* blocked storage */ } };

/** The sprites, loaded once. A sprite that hasn't loaded yet is simply skipped for that frame. */
const sprites = (() => {
  let cache: Record<'bg' | 'run' | 'reactions' | 'turn' | 'orb', HTMLImageElement> | null = null;
  return () => {
    if (!cache) {
      const img = (n: string) => { const i = new Image(); i.src = `${ART}/${n}.webp`; return i; };
      cache = { bg: img('bg'), run: img('run'), reactions: img('reactions'), turn: img('turn'), orb: img('orb') };
    }
    return cache;
  };
})();
const ready = (i: HTMLImageElement) => i.complete && i.naturalWidth > 0;

interface Floater { x: number; y: number; text: string; color: string; age: number }
interface Fx { floaters: Floater[]; react: { frame: 0 | 1; left: number } | null; flash: { color: string; left: number } | null; banner: { text: string; left: number } | null; px: number }

/** Ana runs at the Nexus; steer her through the gate with the right answer. */
export function GateRunner() {
  const { hero } = useSession();
  const key = `hh-gate-${hero.id}`;
  const [best, setBest] = useState(() => loadBest(key));
  const [phase, setPhase] = useState<'ready' | 'play' | 'over'>('ready');
  const [final, setFinal] = useState({ score: 0, cleared: 0, asked: 0, bestCombo: 0, newBest: false });
  const state = useRef<GateState>(newState());
  const canvas = useRef<HTMLCanvasElement>(null);

  const start = () => { sprites(); state.current = newState(); setPhase('play'); };

  useEffect(() => { sprites(); }, []);

  useEffect(() => {
    if (phase !== 'play') return;
    const c = canvas.current;
    const ctx = c?.getContext('2d');
    if (!c || !ctx) return;
    const calm = isQuiet() || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const fx: Fx = { floaters: [], react: null, flash: null, banner: null, px: CX };
    let raf = 0, last = performance.now();
    const frame = (now: number) => {
      const s = state.current;
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      step(s, dt);
      for (const e of s.events) {
        if (e.kind === 'right') {
          const m = multiplier(s.combo);
          const base = 520 + Math.min(s.combo, 8) * 30;
          beep(base, 90, 'square', 0.08); setTimeout(() => beep(base * 1.26, 90, 'square', 0.08), 70); setTimeout(() => beep(base * 1.5, 160, 'square', 0.08), 140);
          fx.floaters.push({ x: laneX(s.lane, 1), y: PLAYER_Y - 170, text: `+${100 * m}${m > 1 ? ` ×${m}` : ''}`, color: C.gold, age: 0 });
          fx.react = { frame: 0, left: 0.5 };
          fx.flash = { color: '#ffe6a0', left: 0.12 };
        } else if (e.kind === 'wrong') {
          beep(180, 350, 'sawtooth', 0.1);
          fx.floaters.push({ x: laneX(s.lane, 1), y: PLAYER_Y - 170, text: `It was ${e.row.a}`, color: C.ember, age: 0 });
          fx.react = { frame: 1, left: 0.55 };
          fx.flash = { color: '#ff3c6e', left: 0.15 };
          if (!calm) shake(c, 6);
        } else if (e.kind === 'orb') {
          beep(1400, 70, 'triangle', 0.06);
        } else if (e.kind === 'level') {
          [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 140, 'square', 0.07), i * 80));
          fx.banner = { text: `LEVEL ${e.level}`, left: 1.4 };
        }
      }
      s.events = [];
      draw(ctx, s, fx, dt, now / 1000, calm);
      if (s.over) {
        [392, 330, 262].forEach((f, i) => setTimeout(() => beep(f, 220, 'triangle', 0.08), i * 180));
        const newBest = s.score > best;
        if (newBest) { setBest(s.score); saveBest(key, s.score); }
        const result = { score: s.score, cleared: s.cleared, asked: s.asked, bestCombo: s.bestCombo, newBest: newBest && best > 0 };
        // let the last gate's answer show for a moment before the results
        setTimeout(() => { setFinal(result); setPhase('over'); }, 900);
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'a') { e.preventDefault(); if (move(state.current, -1)) beep(330, 50, 'triangle', 0.05); }
      if (e.key === 'ArrowRight' || e.key === 'd') { e.preventDefault(); if (move(state.current, 1)) beep(330, 50, 'triangle', 0.05); }
    };
    window.addEventListener('keydown', onKey);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('keydown', onKey); };
  }, [phase]); // eslint-disable-line react-hooks/exhaustive-deps

  // Swipe left or right, or tap the left or right half of the track.
  const touch = useRef<{ x: number } | null>(null);
  const onDown = (e: React.PointerEvent) => { touch.current = { x: e.clientX }; };
  const onUp = (e: React.PointerEvent) => {
    const t = touch.current; touch.current = null;
    if (!t) return;
    const dx = e.clientX - t.x;
    const rect = e.currentTarget.getBoundingClientRect();
    const dir = Math.abs(dx) > 24 ? Math.sign(dx) : e.clientX < rect.left + rect.width / 2 ? -1 : 1;
    if (move(state.current, dir as -1 | 1)) beep(330, 50, 'triangle', 0.05);
  };

  if (phase === 'over' && final.cleared >= GATE_WIN) {
    return (
      <GameFrame title="Gate Runner">
        <img className="gate-ana" src={`${ART}/celebrate.webp`} alt="" draggable={false} />
        <WinPanel game="gate-runner" message={`${final.cleared} gates cleared! ${final.score} points`} onAgain={start} />
      </GameFrame>
    );
  }
  if (phase === 'over') {
    return (
      <GameFrame title="Gate Runner">
        <img className="gate-ana" src={`${ART}/encourage.webp`} alt="" draggable={false} />
        <h3 className="gate-score">{final.score} points</h3>
        <p className="hint">
          {final.cleared} of {final.asked} gates right · best streak ×{final.bestCombo}
          <br />{final.newBest ? 'New best!' : `Best: ${best}`} · clear {GATE_WIN} gates in one run for the daily reward
        </p>
        <button className="btn primary" onClick={start}>Run again</button>
      </GameFrame>
    );
  }
  if (phase === 'ready') {
    return (
      <GameFrame title="Gate Runner" hint="Swipe or tap left and right to run through the gate with the right answer.">
        <img className="gate-logo" src={`${ART}/logo.webp`} alt="Gate Runner" draggable={false} />
        <img className="gate-ana" src={`${ART}/title.webp`} alt="" draggable={false} />
        <p className="note">Best: {best} · {HEARTS} wrong gates end the run · clear {GATE_WIN} for the daily reward</p>
        <button className="btn primary" onClick={start}>Run!</button>
      </GameFrame>
    );
  }
  return (
    <GameFrame title="Gate Runner" onExit={() => setPhase('ready')}>
      <div className="gate-stage" onPointerDown={onDown} onPointerUp={onUp}>
        <canvas ref={canvas} className="gate-canvas" width={W * SCALE} height={H * SCALE} aria-label="Gate Runner game" />
      </div>
    </GameFrame>
  );
}

function draw(ctx: CanvasRenderingContext2D, s: GateState, fx: Fx, dt: number, t: number, calm: boolean) {
  const img = sprites();
  ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
  ctx.fillStyle = C.void; ctx.fillRect(0, 0, W, H);
  // background: the Nexus art, cropped to fill the stage, with its portal sitting on the horizon
  if (ready(img.bg)) {
    const k = Math.max(W / img.bg.naturalWidth, H / img.bg.naturalHeight);
    const bw = img.bg.naturalWidth * k, bh = img.bg.naturalHeight * k;
    ctx.drawImage(img.bg, (W - bw) / 2, HORIZON - bh * 0.27, bw, bh);
    ctx.fillStyle = '#0b071766'; ctx.fillRect(0, 0, W, H);
  }

  // the road
  const scroll = (s.time * (s.intro > 0 ? 0.2 : s.speed) * 1.5) % 1;
  const b = proj(1.2);
  ctx.fillStyle = '#150b2ecc';
  ctx.beginPath(); ctx.moveTo(CX - 24, HORIZON); ctx.lineTo(CX + 24, HORIZON); ctx.lineTo(CX + b.half, b.y); ctx.lineTo(CX - b.half, b.y); ctx.closePath(); ctx.fill();
  for (let i = 0; i < 16; i++) {
    const q = proj(((i / 16) + scroll) % 1);
    ctx.strokeStyle = `rgba(139,92,255,${0.08 + 0.45 * q.p})`; ctx.lineWidth = 1 + 2.5 * q.p;
    ctx.beginPath(); ctx.moveTo(CX - q.half, q.y); ctx.lineTo(CX + q.half, q.y); ctx.stroke();
  }
  for (const side of [-1, 1]) {
    ctx.strokeStyle = C.gate; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(CX + side * 24, HORIZON); ctx.lineTo(CX + side * b.half, b.y); ctx.stroke();
    ctx.strokeStyle = 'rgba(54,226,255,0.35)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(CX + side * 8, HORIZON); ctx.lineTo(CX + side * b.half * 0.33, b.y); ctx.stroke();
  }

  // orbs, then gates (farthest first so near ones cover far ones)
  for (const o of s.orbs) {
    const q = proj(o.z), x = laneX(o.lane, o.z), y = q.y - 26 * q.s - Math.sin(t * 6 + o.z * 20) * 4 * q.s, r = 14 * q.s;
    if (ready(img.orb)) ctx.drawImage(img.orb, x - r, y - r, r * 2, r * 2);
    else { ctx.fillStyle = C.gold; ctx.beginPath(); ctx.arc(x, y, r * 0.8, 0, 7); ctx.fill(); }
  }
  for (const r of [...s.rows].sort((a, b) => a.z - b.z)) {
    const q = proj(r.z), gw = q.half * 0.56, gh = 158 * q.s, fade = Math.min(1, r.z * 7);
    r.opts.forEach((o, i) => {
      const x = laneX(i - 1, r.z), y = q.y;
      const col = !r.done ? C.gate : o === r.a ? C.gold : i === r.picked ? C.ember : '#6b5aa8';
      ctx.globalAlpha = fade;
      ctx.fillStyle = col + '22'; roundRect(ctx, x - gw / 2, y - gh, gw, gh, Math.max(2, 14 * q.s)); ctx.fill();
      ctx.strokeStyle = col; ctx.lineWidth = 3.5 * q.s + 1; ctx.stroke();
      ctx.fillStyle = col; ctx.fillRect(x - gw * 0.3, y - gh + 6 * q.s, gw * 0.6, 3 * q.s + 1);
      ctx.font = `800 ${Math.round(46 * q.s)}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 6 * q.s; ctx.strokeStyle = C.void; ctx.strokeText(String(o), x, y - gh * 0.52);
      ctx.fillStyle = r.done && o === r.a ? C.gold : '#fff'; ctx.fillText(String(o), x, y - gh * 0.52);
      ctx.globalAlpha = 1;
    });
  }

  // Ana: turns to look back during the intro, then runs; cheers or stumbles for a moment after a gate
  fx.px += (laneX(s.lane, 1) - fx.px) * Math.min(1, dt * 14);
  ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.beginPath(); ctx.ellipse(fx.px, PLAYER_Y + 4, 34, 9, 0, 0, 7); ctx.fill();
  const size = 150;
  if (s.intro > 0 && ready(img.turn)) {
    ctx.drawImage(img.turn, fx.px - size / 2, PLAYER_Y - size + 8, size, size);
  } else if (fx.react && ready(img.reactions)) {
    const fw = img.reactions.naturalWidth / 2, fh = img.reactions.naturalHeight;
    ctx.drawImage(img.reactions, fx.react.frame * fw, 0, fw, fh, fx.px - size / 2, PLAYER_Y - size + 6, size, size * fh / fw);
  } else if (ready(img.run)) {
    const fw = img.run.naturalWidth / 2, fh = img.run.naturalHeight / 2;
    const f = Math.floor(s.time * (6 + s.speed * 14)) % 4;
    const bob = calm ? 0 : Math.abs(Math.sin(s.time * 12)) * 3;
    ctx.drawImage(img.run, (f % 2) * fw, Math.floor(f / 2) * fh, fw, fh, fx.px - size / 2, PLAYER_Y - size + 8 - bob, size, size);
  }
  if (fx.react && (fx.react.left -= dt) <= 0) fx.react = null;

  // floating points and answers
  for (const f of fx.floaters) {
    f.age += dt;
    ctx.globalAlpha = Math.max(0, 1 - f.age / 0.9);
    ctx.font = `800 28px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 6; ctx.strokeStyle = C.void; ctx.strokeText(f.text, f.x, f.y - f.age * 80);
    ctx.fillStyle = f.color; ctx.fillText(f.text, f.x, f.y - f.age * 80);
    ctx.globalAlpha = 1;
  }
  fx.floaters = fx.floaters.filter((f) => f.age < 0.9);
  if (fx.flash) {
    if (!calm) { ctx.globalAlpha = Math.max(0, fx.flash.left / 0.15) * 0.35; ctx.fillStyle = fx.flash.color; ctx.fillRect(0, 0, W, H); ctx.globalAlpha = 1; }
    if ((fx.flash.left -= dt) <= 0) fx.flash = null;
  }

  // HUD: score and hearts, then the question panel
  ctx.textBaseline = 'top';
  ctx.font = `800 24px ${FONT}`; ctx.textAlign = 'left'; ctx.fillStyle = C.ink; ctx.fillText(String(s.score), 18, 12);
  ctx.textAlign = 'right'; ctx.fillStyle = C.ember; ctx.fillText('♥'.repeat(s.hearts) + '♡'.repeat(Math.max(0, HEARTS - s.hearts)), W - 18, 10);
  ctx.fillStyle = 'rgba(11,7,23,0.78)'; roundRect(ctx, 16, 48, W - 32, 86, 18); ctx.fill();
  ctx.strokeStyle = C.portal; ctx.lineWidth = 2; ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = `800 13px ${FONT}`; ctx.fillStyle = C.gate; ctx.fillText('RUN THROUGH THE RIGHT GATE', CX, 58);
  const row = s.rows.find((r) => !r.done) ?? s.rows[s.rows.length - 1];
  const qText = s.intro > 0 || !row ? 'Get ready…' : row.done ? `${row.q} = ${row.a}` : `${row.q} = ?`;
  ctx.font = `800 36px ${FONT}`; ctx.fillStyle = row?.done ? (row.opts[row.picked ?? 0] === row.a ? C.gold : C.ember) : '#fff';
  ctx.fillText(qText, CX, 80);
  if (s.combo >= 2) { ctx.font = `800 20px ${FONT}`; ctx.fillStyle = C.gold; ctx.fillText(`STREAK ×${s.combo}`, CX, 142); }
  if (fx.banner) {
    ctx.globalAlpha = Math.min(1, fx.banner.left / 0.3);
    ctx.font = `800 52px ${FONT}`; ctx.lineWidth = 8; ctx.strokeStyle = C.void; ctx.strokeText(fx.banner.text, CX, 300);
    ctx.fillStyle = C.gate; ctx.fillText(fx.banner.text, CX, 300);
    ctx.font = `800 16px ${FONT}`; ctx.fillStyle = C.ink; ctx.fillText('The Nexus speeds up', CX, 360);
    ctx.globalAlpha = 1;
    if ((fx.banner.left -= dt) <= 0) fx.banner = null;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
