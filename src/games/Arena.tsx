import { useRef, useState } from 'react';
import { GameFrame } from './GameFrame.tsx';
import { useSession } from '../App.tsx';
import { HeroArt } from '../components/HeroArt.tsx';
import { FOES, HERO_HP, MOVES, POWER_COST, arenaStars, botMove, canDo, playTurn, startBattle, type Battle, type Foe, type Move } from '../lib/arena.ts';

const Bar = ({ label, hp, max }: { label: string; hp: number; max: number }) => (
  <div className="arena-bar" role="img" aria-label={`${label}: ${hp} of ${max} health`}>
    <i style={{ width: `${Math.max(0, (hp / max) * 100)}%` }} />
    <small>{hp}/{max}</small>
  </div>
);

/** Friendly sparring: turn-based, nobody loses. At zero health your hero gets a second wind. */
export function Arena() {
  const { hero } = useSession();
  const [battle, setBattle] = useState<Battle | null>(null);
  const [hit, setHit] = useState<'hero' | 'foe' | null>(null);
  const timer = useRef<number | undefined>(undefined);

  if (!battle) {
    return (
      <GameFrame title="Battle Arena" hint="Spar with a training bot. Nobody loses: if your health runs out, you get a second wind.">
        <div className="grow" />
        {FOES.map((f) => <button className="btn primary" key={f.id} onClick={() => setBattle(startBattle(f))}>{f.icon} {f.name} <small>{f.blurb}</small></button>)}
        <div className="grow" />
      </GameFrame>
    );
  }
  const foe: Foe = battle.foe;
  const play = (m: Move) => {
    const next = playTurn(battle, m, botMove(battle, Math.random));
    setHit(next.bot.hp < battle.bot.hp ? 'foe' : next.hero.hp < battle.hero.hp ? 'hero' : null);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setHit(null), 600);
    setBattle(next);
  };
  if (battle.won) {
    const n = arenaStars(battle);
    return (
      <GameFrame title="Battle Arena" onExit={() => setBattle(null)}>
        <div className="grow" />
        <div className="soon-icon" aria-hidden>{'⭐'.repeat(n)}</div>
        <h3>You beat {foe.name}!</h3>
        <p className="hint">{battle.secondWinds === 0 ? 'A clean win!' : `You got back up ${battle.secondWinds} time${battle.secondWinds > 1 ? 's' : ''}. That is what heroes do.`}</p>
        <div className="grow" />
        <div className="btn-grid">
          <button className="btn ghost" onClick={() => setBattle(startBattle(foe))}>Fight again</button>
          <button className="btn primary" onClick={() => setBattle(null)}>Pick a bot</button>
        </div>
      </GameFrame>
    );
  }
  return (
    <GameFrame title="Battle Arena" onExit={() => setBattle(null)}>
      <div className="arena">
        <div className="arena-field">
          <div className={`arena-side${hit === 'hero' ? ' hurt' : ''}`}><HeroArt id={hero.starter} className="arena-hero" /><Bar label="You" hp={battle.hero.hp} max={HERO_HP} /></div>
          <div className={`arena-side${hit === 'foe' ? ' hurt' : ''}`}><span className="arena-foe" aria-hidden>{foe.icon}</span><Bar label={foe.name} hp={battle.bot.hp} max={foe.hp} /></div>
        </div>
        <p className="hint" role="status">{battle.log[battle.log.length - 1]}</p>
        <p className="hint">⚡ Energy: {'●'.repeat(battle.hero.energy)}{'○'.repeat(Math.max(0, POWER_COST - battle.hero.energy))} · 💚 Heals left: {battle.hero.heals}</p>
        <div className="arena-moves">
          {MOVES.map((m) => <button key={m.id} className="btn" disabled={!canDo(battle.hero, m.id, HERO_HP)} onClick={() => play(m.id)} aria-label={`${m.label}. ${m.blurb}`}>{m.icon} {m.label}</button>)}
        </div>
      </div>
    </GameFrame>
  );
}
