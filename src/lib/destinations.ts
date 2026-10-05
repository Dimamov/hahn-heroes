export interface Destination {
  id: string;
  label: string;
  icon: string;
  tint: string;
  /** What this screen will be, shown until its milestone is built. */
  blurb: string;
  milestone: string;
  /** Opens a link instead of a screen. */
  href?: string;
}

// Icons are emoji placeholders until the nav icon set (image list section 10b) arrives.
export const DESTINATIONS: Destination[] = [
  { id: 'arcade', label: 'Arcade', icon: '🕹️', tint: '#ff3fa4', blurb: 'ODIN, Word Rush, Pattern Pulse, Memory Flip and more, solo or with your squad.', milestone: 'Solo arcade and squad play' },
  { id: 'adventures', label: 'Adventures', icon: '📖', tint: '#8b5cff', blurb: 'Episode 1, Mystery Lab and Chronicle Quest. Uncover the secret of the Nexus.', milestone: 'Story and events' },
  { id: 'missions', label: 'Missions', icon: '📋', tint: '#22d3ee', blurb: 'Home missions from your grown-up and class missions from your teacher.', milestone: 'Parents, teachers and the Sensei' },
  { id: 'hero', label: 'My Hero', icon: '🦸', tint: '#a78bfa', blurb: 'Wardrobe, shop and skills for your hero.', milestone: 'Collections' },
  { id: 'room', label: 'My Room', icon: '🛏️', tint: '#34d399', blurb: 'Decorate your dorm room and invite friends to visit.', milestone: 'Collections' },
  { id: 'nexlings', label: 'Nexlings', icon: '🐾', tint: '#fbbf24', blurb: 'Pick a Nexling companion and watch it grow.', milestone: 'Collections' },
  { id: 'cards', label: 'Cards', icon: '🃏', tint: '#f472b6', blurb: 'Collect, show off and trade cards.', milestone: 'Collections' },
  { id: 'squad', label: 'Squad', icon: '👥', tint: '#38bdf8', blurb: 'Your friends, your squad and your House.', milestone: 'Squad play' },
  { id: 'settings', label: 'Settings', icon: '⚙️', tint: '#94a3b8', blurb: 'Sound, motion and reading options.', milestone: 'Collections' },
  { id: 'sensei', label: 'Contact the Sensei', icon: '🧙', tint: '#c084fc', blurb: 'Send a message or report a bug.', milestone: 'Foundation', href: 'mailto:info@detcorddigital.com?subject=HAHN%20Heroes' },
  { id: 'guide', label: 'How the Nexus Works', icon: '❓', tint: '#60a5fa', blurb: 'The Sensei explains how to play.', milestone: 'Story and events' },
  { id: 'donotpress', label: 'Do Not Press', icon: '🚨', tint: '#ef4444', blurb: 'You were warned...', milestone: 'Solo arcade (Fun Box)' },
];
