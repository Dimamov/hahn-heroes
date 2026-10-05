import { ScreenBar } from '../components/ScreenBar.tsx';
import { Pager } from '../components/Pager.tsx';

const SECTIONS: { title: string; lines: string[] }[] = [
  { title: 'What this app is', lines: [
    'HAHN Heroes is a free learning game for 5th and 6th graders at Hahn Intermediate School.',
    'It is run by Detcord Digital for the school. It has no ads, and nothing in it is sold.',
  ] },
  { title: 'What we keep about a hero', lines: [
    'A made-up hero name picked from a list, grade (5 or 6), the hero picture, a secret picture password, and a sign-in code and friend code.',
    'Learning answers, points, cards, game results, and which screen you are on so the school can see the app is working.',
    'The picture password is stored only as a scrambled code.',
  ] },
  { title: 'What we never ask for', lines: [
    'No real names, emails, birthdays, photos, home addresses, location or voice for heroes.',
    'No ads and no trackers. Heroes cannot type a profile or send private messages.',
  ] },
  { title: 'Who can see it', lines: [
    'A hero sees their own things. A parent sees the heroes linked to them with a one-time code.',
    'A teacher sees the heroes in their own class. The Sensei (the school administrator) sees everything needed to keep the app safe.',
    'Friends see only your hero name, grade and hero picture.',
  ] },
  { title: 'Chat and drawing safety', lines: [
    'Chat only works inside a game room, for heroes who joined a teacher’s class. Messages are short and filtered for bad words, links and phone numbers.',
    'Two blocked messages pause chat. Drawings can be reported, and a reported drawing disappears at once.',
  ] },
  { title: 'Other companies', lines: [
    'Supabase stores the data and Cloudflare serves the app (United States).',
    'One game plays a YouTube video using YouTube’s privacy-enhanced player. Fonts come from the app itself.',
    'Sign-in IP addresses are erased after 30 days.',
  ] },
  { title: 'Questions and deleting', lines: [
    'A parent or the school can ask for a hero and all their data to be deleted at any time.',
    'Email info@detcorddigital.com and we will remove it.',
  ] },
];

/** Plain-language privacy and safety notice. One short topic per page. */
export function Privacy({ onBack }: { onBack: () => void }) {
  return (
    <main className="screen">
      <ScreenBar title="Privacy and safety" onBack={onBack} />
      <div className="paged">
        <Pager pages={SECTIONS.map((s) => (
          <div className="list-page" key={s.title}>
            <h3>{s.title}</h3>
            {s.lines.map((l) => <p className="privacy-line" key={l}>{l}</p>)}
          </div>
        ))} />
      </div>
    </main>
  );
}
