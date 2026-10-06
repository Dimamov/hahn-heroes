// Game juice: particle bursts, floating score popups, screen shake and a confetti rain.
// Everything is a short-lived DOM element animated with the Web Animations API, capped so phones stay smooth,
// and skipped entirely when the player asks for reduced motion.
import { isQuiet } from './sound.ts';
const reduced = () => isQuiet() || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);

let layer: HTMLElement | null = null;
const root = (): HTMLElement => {
  if (layer && layer.isConnected) return layer;
  layer = document.createElement('div');
  layer.className = 'fx-layer';
  layer.setAttribute('aria-hidden', 'true');
  document.body.appendChild(layer);
  return layer;
};

const MAX_LIVE = 70;
const live = () => root().childElementCount;

const SPARKS = ['✦', '✧', '★', '•'];

/** Where an element's centre is on screen. */
export const centerOf = (el: Element | null | undefined): { x: number; y: number } => {
  if (!el) return { x: innerWidth / 2, y: innerHeight / 2 };
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
};

/** A burst of glowing sparks flying out from a point. */
export function burst(x: number, y: number, color = '#fbbf24', n = 12, power = 70) {
  if (reduced()) return;
  const r = root();
  const count = Math.min(n, Math.max(0, MAX_LIVE - live()));
  for (let i = 0; i < count; i++) {
    const s = document.createElement('i');
    s.className = 'fx-spark';
    s.textContent = SPARKS[i % SPARKS.length];
    s.style.cssText = `left:${x}px;top:${y}px;color:${color};text-shadow:0 0 8px ${color};font-size:${10 + Math.random() * 12}px`;
    r.appendChild(s);
    const a = (Math.PI * 2 * i) / count + Math.random() * 0.6;
    const d = power * (0.5 + Math.random() * 0.8);
    const anim = s.animate(
      [
        { transform: 'translate(-50%,-50%) scale(1.2) rotate(0deg)', opacity: 1 },
        { transform: `translate(calc(-50% + ${Math.cos(a) * d}px), calc(-50% + ${Math.sin(a) * d + 18}px)) scale(.2) rotate(${Math.random() * 360}deg)`, opacity: 0 },
      ],
      { duration: 480 + Math.random() * 280, easing: 'cubic-bezier(.15,.7,.4,1)' },
    );
    anim.onfinish = () => s.remove();
  }
}

/** A word or number that pops up, floats and fades ("+10", "COMBO x3!"). */
export function popup(x: number, y: number, text: string, color = '#fff', big = false) {
  if (reduced() || live() > MAX_LIVE) return;
  const p = document.createElement('b');
  p.className = `fx-pop${big ? ' big' : ''}`;
  p.textContent = text;
  p.style.cssText = `left:${x}px;top:${y}px;color:${color}`;
  root().appendChild(p);
  const anim = p.animate(
    [
      { transform: 'translate(-50%,-30%) scale(.4)', opacity: 0 },
      { transform: 'translate(-50%,-90%) scale(1.25)', opacity: 1, offset: 0.25 },
      { transform: 'translate(-50%,-190%) scale(1)', opacity: 0 },
    ],
    { duration: big ? 1000 : 750, easing: 'ease-out' },
  );
  anim.onfinish = () => p.remove();
}

/** Shake an element (or the whole game screen). */
export function shake(el: Element | null = document.querySelector('.screen.game'), strength = 7) {
  if (reduced() || !el) return;
  (el as HTMLElement).animate(
    [
      { transform: 'translate(0,0)' },
      { transform: `translate(${-strength}px,${strength / 2}px)` },
      { transform: `translate(${strength}px,${-strength / 2}px)` },
      { transform: `translate(${-strength / 2}px,0)` },
      { transform: 'translate(0,0)' },
    ],
    { duration: 300, easing: 'ease-out' },
  );
}

/** A red flash around the screen edge for a mistake. */
export function flashEdge(color = '#ff5c7a') {
  if (reduced()) return;
  const f = document.createElement('div');
  f.className = 'fx-edge';
  f.style.boxShadow = `inset 0 0 70px 12px ${color}`;
  root().appendChild(f);
  const anim = f.animate([{ opacity: 0.9 }, { opacity: 0 }], { duration: 420, easing: 'ease-out' });
  anim.onfinish = () => f.remove();
}

/** Confetti raining from the top: for a win. */
export function confetti(n = 26) {
  if (reduced()) return;
  const r = root();
  const colors = ['#ff3fa4', '#22d3ee', '#fbbf24', '#8b5cff', '#4ade80'];
  const count = Math.min(n, Math.max(0, MAX_LIVE - live()));
  for (let i = 0; i < count; i++) {
    const c = document.createElement('i');
    c.className = 'fx-confetti';
    const x = Math.random() * innerWidth;
    c.style.cssText = `left:${x}px;top:-14px;background:${colors[i % colors.length]}`;
    r.appendChild(c);
    const anim = c.animate(
      [
        { transform: 'translateY(0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${(Math.random() - 0.5) * 120}px, ${innerHeight + 30}px) rotate(${360 + Math.random() * 540}deg)`, opacity: 0.8 },
      ],
      { duration: 1400 + Math.random() * 1200, delay: Math.random() * 350, easing: 'cubic-bezier(.3,.2,.7,1)', fill: 'backwards' },
    );
    anim.onfinish = () => c.remove();
  }
}

/** Combo wording by streak length. */
export const comboWord = (n: number): string =>
  n >= 8 ? 'LEGENDARY!' : n >= 5 ? 'UNSTOPPABLE!' : n >= 3 ? 'COMBO x' + n : '';
