import { useSession } from '../App.tsx';
import { ScreenBar } from '../components/ScreenBar.tsx';
import { Pager } from '../components/Pager.tsx';

const PAGES: { icon: string; title: string; text: string }[] = [
  { icon: '🌌', title: 'Welcome to the Nexus', text: 'The Nexus is your hero base. Learn, play games and finish missions to earn points, level up and grow your hero.' },
  { icon: '💎', title: 'Points and XP', text: 'Right answers earn Nexus points 💎, XP ⭐ and skill points 🌳. Spend points in the shop, and XP unlocks new gear as you level up. There is a weekly limit, so come back every week.' },
  { icon: '🧠', title: 'Learn every day', text: 'Practice math, words, reading and science. Every question is new, just for you. Do your Daily Quest to grow your streak and collect a daily check-in gift.' },
  { icon: '🏰', title: 'Houses and squads', text: 'Your teacher makes a House for your class. Every right answer helps your House on the leaderboard. Add friends with their friend code and team up in your squad.' },
  { icon: '🐾', title: 'Collect and decorate', text: 'Raise a Nexling that grows in four stages, collect and trade cards, dress your hero and decorate your room.' },
  { icon: '🔒', title: 'Stay safe', text: 'Your secret sign-in code is only for you. Never share it, and share your friend code only with kids you know. Be kind in chat. If something feels wrong, tell a grown-up or the Sensei.' },
  { icon: '🎉', title: 'Have fun!', text: 'Trivia Night is on Thursdays at 6:30 pm. Check announcements from the Sensei, and open the Fun Box when you need a laugh. Now go be a hero!' },
];

/** "How the Nexus Works": a short swipe-through guide written for 5th and 6th graders. */
export function Guide() {
  const { go } = useSession();
  return (
    <main className="screen story">
      <ScreenBar title="How the Nexus Works" onBack={() => go('home')} />
      <Pager pages={PAGES.map((p) => (
        <div className="panel bg-dusk" key={p.title}>
          <span className="panel-emoji" aria-hidden>{p.icon}</span>
          <h3>{p.title}</h3>
          <p className="panel-text">{p.text}</p>
        </div>
      ))} />
    </main>
  );
}
