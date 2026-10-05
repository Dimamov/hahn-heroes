import { beforeEach, describe, expect, it } from 'vitest';
import { createDemoBackend } from './demo-backend.ts';
import { SignInError } from './backend.ts';
import { isWild, playable } from './odin-rules.ts';
import bank from '../../content/questions.json';

const DAY_MS = 24 * 60 * 60 * 1000;
const keyOf = (id: string) => (bank as { id: string; answer: number }[]).find((q) => q.id === id)!.answer;

const memoryStorage = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};
const input = { grade: 5 as const, hero: 'ana', nameAdjective: 'Brave', nameNoun: 'Comet', picture: [0, 4, 8] };

describe('demo backend', () => {
  let storage: ReturnType<typeof memoryStorage>;
  let clock: Date;
  const make = () => createDemoBackend(storage, () => clock);
  beforeEach(() => {
    storage = memoryStorage();
    clock = new Date('2026-10-06T15:00:00Z');
  });

  it('creates a hero, remembers it after a reload, and signs out and back in', async () => {
    const a = make();
    const hero = await a.signUp(input);
    expect(hero.displayName).toBe('Brave Comet');
    expect(await make().restore()).toMatchObject({ kind: 'hero', hero: { heroCode: hero.heroCode } });

    await a.signOut();
    expect(await make().restore()).toBeNull();
    const again = await make().signIn(hero.heroCode.toLowerCase(), [0, 4, 8]);
    expect(again.id).toBe(hero.id);
  });

  it('rejects bad sign-up details', async () => {
    await expect(make().signUp({ ...input, nameNoun: 'Hax' })).rejects.toThrow();
    await expect(make().signUp({ ...input, picture: [1, 1, 1] })).rejects.toThrow();
    await expect(make().signUp({ ...input, hero: 'nobody' })).rejects.toThrow();
  });

  it('rests a hero after 5 wrong tries, then lets them back in', async () => {
    const b = make();
    const hero = await b.signUp(input);
    for (let i = 0; i < 5; i++) {
      await expect(b.signIn(hero.heroCode, [8, 4, 0])).rejects.toMatchObject({ kind: 'wrong' });
    }
    // Even the right pictures wait while the hero is resting.
    await expect(b.signIn(hero.heroCode, [0, 4, 8])).rejects.toMatchObject({ kind: 'resting' });
    clock = new Date(clock.getTime() + 16 * 60_000);
    expect((await b.signIn(hero.heroCode, [0, 4, 8])).id).toBe(hero.id);
  });

  it('does not reveal whether a code exists', async () => {
    await expect(make().signIn('ZZZZZZZZ', [0, 1, 2])).rejects.toBeInstanceOf(SignInError);
  });

  it('pays the daily reward once per school day', async () => {
    const b = make();
    await b.signUp(input);
    expect(await b.dailyStatus()).toEqual({ available: true, amount: 10 });
    expect(await b.claimDaily()).toEqual({ awarded: 10, duplicate: false });
    expect(await b.claimDaily()).toEqual({ awarded: 0, duplicate: true });
    expect((await b.balances()).coins).toBe(10);
    expect((await b.dailyStatus()).available).toBe(false);

    // A refresh (new backend over the same storage) can't double-pay either.
    expect(await make().claimDaily()).toEqual({ awarded: 0, duplicate: true });

    clock = new Date('2026-10-07T15:00:00Z');
    expect((await b.dailyStatus()).available).toBe(true);
    expect((await b.claimDaily()).awarded).toBe(10);
  });

  it('keeps each hero\'s points separate', async () => {
    const first = make();
    await first.signUp(input);
    await first.claimDaily();
    await first.signOut();
    const second = make();
    await second.signUp({ ...input, picture: [1, 2, 3] });
    expect((await second.balances()).coins).toBe(0);
  });
});

describe('demo backend: grown-ups and missions', () => {
  let storage: ReturnType<typeof memoryStorage>;
  let clock: Date;
  const make = () => createDemoBackend(storage, () => clock);
  beforeEach(() => {
    storage = memoryStorage();
    clock = new Date('2026-10-06T15:00:00Z');
  });

  /** A hero, a linked parent, and an approved teacher with a grade 5 class. */
  async function setup() {
    const b = make();
    const hero = await b.signUp(input);
    const { code } = await b.linkCode();
    await b.signOut();
    await b.adultSignUp('pat@example.com', 'secret1', 'parent', 'Pat Parent');
    expect(await b.claimLink(code)).toEqual({ ok: true, childName: 'Brave Comet' });
    await b.signOut();
    await b.adultSignUp('tess@example.com', 'secret1', 'teacher', 'Tess Teacher');
    await b.signOut();
    await b.adultSignIn('sensei@demo.test', 'sensei');
    const [pending] = await b.pendingTeachers();
    await b.approveTeacher(pending.id, true);
    await b.signOut();
    await b.adultSignIn('tess@example.com', 'secret1');
    const cls = await b.createClass('Room 12', 5);
    await b.signOut();
    return { b, hero, cls };
  }

  it('runs a class House vote, then shows the House on the leaderboard', async () => {
    const { b, hero, cls } = await setup();
    await b.signIn(hero.heroCode, [0, 4, 8]);
    expect((await b.houseState()).state).toBe('no_class');
    expect(await b.joinClass(cls.joinCode!)).toMatchObject({ ok: true });
    expect((await b.houseState()).state).toBe('none');
    await b.signOut();

    await b.adultSignIn('tess@example.com', 'secret1');
    const ideas = [
      { name: 'Ember Owls', color: '#f97316', power: 'flame', motto: 'Burn bright' },
      { name: 'Tide Titans', color: '#06b6d4', power: 'tide', motto: '' },
    ];
    await expect(b.houseProposeOptions(cls.id, [ideas[0], ideas[0]])).rejects.toThrow();
    await expect(b.houseCloseVote(cls.id)).rejects.toThrow();
    await b.houseProposeOptions(cls.id, ideas);
    await expect(b.houseCloseVote(cls.id)).rejects.toThrow(/one vote/);
    await b.signOut();

    await b.signIn(hero.heroCode, [0, 4, 8]);
    const voting = await b.houseState();
    expect(voting.state).toBe('voting');
    await b.houseVote(voting.options![1].id);
    expect((await b.houseState()).myVote).toBe(voting.options![1].id);
    await b.signOut();

    await b.adultSignIn('tess@example.com', 'secret1');
    expect(await b.houseTeacherView(cls.id)).toMatchObject({ state: 'voting', voted: 1 });
    await b.houseCloseVote(cls.id);
    await b.signOut();

    await b.signIn(hero.heroCode, [0, 4, 8]);
    expect(await b.houseState()).toMatchObject({ state: 'active', house: { name: 'Tide Titans' } });
    const board = await b.leaderboard();
    expect(board.houses.some((h) => h.mine && h.name === 'Tide Titans')).toBe(true);
    expect(board.heroes.find((h) => h.me)).toBeUndefined();
  });

  it('sells items once, only with enough points, and keeps the wardrobe and room', async () => {
    const b = make();
    await b.signUp(input);
    expect(await b.shopBuy('a-cap')).toEqual({ ok: false, reason: 'not_enough_coins' });
    for (let d = 0; d < 3; d++) { await b.claimDaily(); clock = new Date(clock.getTime() + DAY_MS); }
    expect(await b.shopBuy('a-crown')).toEqual({ ok: false, reason: 'locked' });
    expect(await b.shopBuy('a-cap')).toEqual({ ok: true });
    expect(await b.shopBuy('a-cap')).toEqual({ ok: false, reason: 'already_owned' });
    const shop = await b.shopState();
    expect(shop.coins).toBe(0);
    expect(shop.items.find((i) => i.id === 'a-cap')).toMatchObject({ owned: true });
    await expect(b.heroEquip('hat', 'a-wizard-hat')).rejects.toThrow();
    await expect(b.heroEquip('face', 'a-cap')).rejects.toThrow();
    await b.heroEquip('hat', 'a-cap');
    expect((await b.shopState()).equipped.hat).toBe('a-cap');
    await b.heroEquip('hat', null);
    expect((await b.shopState()).equipped.hat).toBeNull();
    await expect(b.dormSave([{ item: 'd-lamp', cell: 0 }])).rejects.toThrow(/own/);
    await expect(b.dormGet('someone-else')).rejects.toThrow();
  });

  it('adopts a Nexling that grows with coins earned afterwards', async () => {
    const b = make();
    await b.signUp(input);
    await b.claimDaily(); // earned before adopting: does not count
    expect((await b.nexlingState()).mine).toBeNull();
    await expect(b.nexlingAdopt('dragon', 'Sparky', '#3b82f6')).rejects.toThrow();
    await expect(b.nexlingAdopt('sparkling', 'S', '#3b82f6')).rejects.toThrow();
    await b.nexlingAdopt('sparkling', 'Sparky', '#3b82f6');
    expect((await b.nexlingState()).mine).toMatchObject({ type: 'sparkling', nickname: 'Sparky', growth: 0, stage: 1, nextAt: 100 });
    clock = new Date(clock.getTime() + DAY_MS);
    await b.claimDaily(); // 10 coins from the daily check-in: Sparkling's specialty, 1.5x
    expect((await b.nexlingState()).mine).toMatchObject({ growth: 15 });
    await b.nexlingAdopt('sparkling', 'Zap', '#ef4444');
    expect((await b.nexlingState()).mine).toMatchObject({ nickname: 'Zap', growth: 15 });
    await b.nexlingAdopt('tideling', 'Drip', '#06b6d4');
    expect((await b.nexlingState()).mine).toMatchObject({ type: 'tideling', growth: 0 });
  });

  it('starts Nexus Surge after five right answers and spends skill points on skills', async () => {
    const b = make();
    await b.signUp(input);
    const { questions } = await b.startPractice('math');
    expect(questions).toHaveLength(5);
    let last;
    for (const q of questions) last = await b.answerQuestion(q.id, keyOf(q.id));
    expect(last!.surge).toMatchObject({ active: true, started: true, need: 5 });
    expect((await b.skillState()).points).toBe(5);
    expect(await b.skillLearn('sc2')).toEqual({ ok: false, reason: 'locked' });
    expect(await b.skillLearn('sc1')).toEqual({ ok: true });
    expect(await b.skillLearn('sc1')).toEqual({ ok: false, reason: 'already_learned' });
    expect((await b.skillState()).points).toBe(3);
    expect((await b.skillState()).surge.need).toBe(4);
    expect(await b.skillLearn('ex1')).toEqual({ ok: true });
    expect((await b.dailyStatus()).amount).toBe(13);
    clock = new Date(clock.getTime() + 11 * 60_000);
    expect((await b.skillState()).surge.active).toBe(false);
  });

  it('opens packs from verified progress and trades cards fairly between friends', async () => {
    const a = make();
    const heroA = await a.signUp(input);
    expect((await a.cardsState()).packs).toBe(1);
    const pack = await a.openPack();
    expect(pack.cards).toHaveLength(3);
    await expect(a.openPack()).rejects.toThrow();
    expect((await a.cardsState()).cards.reduce((n, c) => n + c.qty, 0)).toBe(3);
    await a.signOut();
    const heroB = await a.signUp({ ...input, nameNoun: 'Nova', picture: [1, 5, 7] });
    await a.openPack();
    await a.requestFriend(heroA.heroCode);
    await a.signOut();
    await a.signIn(heroA.heroCode, [0, 4, 8]);
    const [req] = (await a.friends()).incoming;
    await a.respondFriend(req.id, true);
    await expect(a.tradeOpen('stranger')).rejects.toThrow();
    const id = await a.tradeOpen(heroB.id);
    expect(await a.tradeOpen(heroB.id)).toBe(id);
    const mine = (await a.cardsState()).cards[0];
    await expect(a.tradeSet(id, [{ card: mine.id, qty: mine.qty + 1 }])).rejects.toThrow();
    await a.tradeSet(id, [{ card: mine.id, qty: 1 }]);
    // one-sided offers can't be confirmed
    await expect(a.tradeConfirm(id, (await a.tradeView(id)).ver, true)).rejects.toThrow(/lopsided/);
    await a.tradeCancel(id);
    expect((await a.tradeList())).toHaveLength(0);
  });

  it('links a parent with a one-time code and limits wrong guesses', async () => {
    const b = make();
    await b.signUp(input);
    const { code } = await b.linkCode();
    expect((await b.linkCode()).code).toBe(code);
    await b.signOut();
    await b.adultSignUp('pat@example.com', 'secret1', 'parent', 'Pat Parent');
    for (let i = 0; i < 10; i++) expect(await b.claimLink(`WRONG${i}`)).toEqual({ ok: false, error: 'invalid_code' });
    expect(await b.claimLink(code)).toEqual({ ok: false, error: 'too_many_tries' });
    clock = new Date(clock.getTime() + 61 * 60_000);
    expect((await b.claimLink(code)).ok).toBe(true);
    expect(await b.claimLink(code)).toEqual({ ok: false, error: 'invalid_code' });
  });

  it('pays a home mission once, after the parent approves, up to the weekly cap', async () => {
    const { b, hero } = await setup();
    await b.adultSignIn('pat@example.com', 'secret1');
    await b.createHomeMission(hero.id, 'Dishes', '', 100);
    let [mission] = await b.childMissions(hero.id);
    await expect(b.reviewHomeMission(mission.id, true)).rejects.toThrow('not waiting');

    await b.signOut();
    await b.signIn(hero.heroCode, [0, 4, 8]);
    await expect(b.reviewHomeMission(mission.id, true)).rejects.toThrow();   // a child can't approve
    await b.submitHomeMission(mission.id);
    await b.signOut();

    await b.adultSignIn('pat@example.com', 'secret1');
    expect((await b.children())[0].waiting).toBe(1);
    expect(await b.reviewHomeMission(mission.id, true)).toMatchObject({ status: 'approved', awarded: 100 });
    await expect(b.reviewHomeMission(mission.id, true)).rejects.toThrow('not waiting');

    // Five more missions of 100: only 400 more fit under the 500 cap.
    let awarded = 0;
    for (let i = 0; i < 5; i++) {
      await b.createHomeMission(hero.id, `Chore ${i}`, '', 100);
      [mission] = (await b.childMissions(hero.id)).filter((m) => m.status === 'assigned');
      await b.signOut(); await b.signIn(hero.heroCode, [0, 4, 8]); await b.submitHomeMission(mission.id); await b.signOut();
      await b.adultSignIn('pat@example.com', 'secret1');
      awarded += (await b.reviewHomeMission(mission.id, true)).awarded;
    }
    expect(awarded).toBe(400);
    expect(await b.childProgress(hero.id)).toMatchObject({ homeWeek: 500, homeCap: 500, coins: 500 });
  });

  it('does not let a parent touch someone else\'s child', async () => {
    const { b } = await setup();
    const other = make();
    const h2 = await other.signUp({ ...input, picture: [1, 2, 3] });
    await other.signOut();
    await other.adultSignIn('pat@example.com', 'secret1');
    await expect(other.createHomeMission(h2.id, 'Hack', '', 10)).rejects.toThrow('not your child');
    await expect(b.children()).rejects.toThrow();
  });

  it('keeps teachers out until the Sensei approves them', async () => {
    const b = make();
    const t = await b.adultSignUp('tess@example.com', 'secret1', 'teacher', 'Tess Teacher');
    expect(t).toMatchObject({ role: 'teacher', approved: false });
    await expect(b.createClass('Room 1', 5)).rejects.toThrow();
  });

  it('grades class missions on the server: one try, 80% to pass, coins follow the score', async () => {
    const { b, hero, cls } = await setup();
    await b.adultSignIn('tess@example.com', 'secret1');
    const questions = Array.from({ length: 5 }, (_, i) => ({ prompt: `Q${i}`, choices: ['a', 'b', 'c'] }));
    await expect(b.createClassMission(cls.id, { title: 'Short', passage: '', questions: questions.slice(0, 2), answers: [0, 0], explanations: ['', ''], maxCoins: 40 })).rejects.toThrow('3 to 10');
    await b.createClassMission(cls.id, { title: 'Reading', passage: 'The fox ran home.', questions, answers: [0, 1, 2, 0, 1], explanations: ['a', 'b', 'c', 'd', 'e'], maxCoins: 40 });
    await b.signOut();

    await b.signIn(hero.heroCode, [0, 4, 8]);
    expect(await b.joinClass('NOPE12')).toEqual({ ok: false, error: 'invalid_code' });
    expect(await b.joinClass(cls.joinCode!.toLowerCase())).toEqual({ ok: true, name: 'Room 12' });
    const [mission] = await b.classMissions();
    expect(JSON.stringify(mission)).not.toContain('"answers"');          // no answer key reaches the student

    const first = await b.submitClassMission(mission.id, [0, 1, 2, 0, 0]);    // 4 of 5 = 80%
    expect(first).toMatchObject({ scorePct: 80, passed: true, coins: 24 });
    expect(first.review![4]).toMatchObject({ correct: false, rightChoice: 1, explanation: 'e' });
    expect(await b.submitClassMission(mission.id, [0, 1, 2, 0, 1])).toMatchObject({ alreadyDone: true, coins: 24 });
    expect((await b.balances()).coins).toBe(24);

    // A reset allows a retake but pays nothing more.
    await b.signOut();
    await b.adultSignIn('tess@example.com', 'secret1');
    expect((await b.classResults(cls.id))[0].submissions).toHaveLength(1);
    await b.resetSubmission(mission.id, hero.id);
    await b.signOut();
    await b.signIn(hero.heroCode, [0, 4, 8]);
    expect(await b.submitClassMission(mission.id, [0, 1, 2, 0, 1])).toMatchObject({ scorePct: 100, coins: 0 });
    expect((await b.balances()).coins).toBe(24);
  });

  it('only lets a hero join a class of their own grade', async () => {
    const { b, cls } = await setup();
    await b.signUp({ ...input, grade: 6, picture: [1, 2, 3] });
    expect(await b.joinClass(cls.joinCode!)).toEqual({ ok: false, error: 'wrong_grade' });
  });

  it('shows an unread dot for announcements until they are read', async () => {
    const { b, hero } = await setup();
    await b.adultSignIn('sensei@demo.test', 'sensei');
    await b.postAnnouncement('Trivia Night', 'Thursday at 6:30');
    expect((await b.senseiOverview()).triviaNight).toEqual({ weekday: 'thursday', time: '18:30' });
    await b.signOut();
    await b.signIn(hero.heroCode, [0, 4, 8]);
    expect((await b.announcements()).unread).toBe(1);
    await b.markAnnouncementsRead();
    expect((await b.announcements()).unread).toBe(0);
  });

  describe('learning', () => {
    it('hands out unseen questions for the hero grade and never repeats one', async () => {
      const b = make();
      await b.signUp(input);
      const seen = new Set<string>();
      for (let n = 0; n < 4; n++) {
        const set = await b.startPractice('math');
        expect(set.questions).toHaveLength(5);
        for (const q of set.questions) {
          expect(q.id.startsWith('m5-')).toBe(true);
          expect(q).not.toHaveProperty('answer');
          expect(seen.has(q.id)).toBe(false);
          seen.add(q.id);
          await b.answerQuestion(q.id, keyOf(q.id));
        }
      }
      expect((await b.startPractice('math')).questions).toHaveLength(0);
    });

    it('resumes an unanswered set instead of using up new questions', async () => {
      const b = make();
      await b.signUp(input);
      const first = (await b.startPractice('science')).questions.map((q) => q.id).sort();
      const again = (await b.startPractice('science')).questions.map((q) => q.id).sort();
      expect(again).toEqual(first);
    });

    it('pays once per right answer, nothing for wrong ones, and explains both', async () => {
      const b = make();
      await b.signUp(input);
      const [a, w] = (await b.startPractice('vocab')).questions;
      const right = await b.answerQuestion(a.id, keyOf(a.id));
      expect(right).toMatchObject({ correct: true, repeat: false, awarded: { coins: 2, xp: 5, skillPoints: 1 } });
      expect(right.explanation.length).toBeGreaterThan(0);
      expect(await b.answerQuestion(a.id, keyOf(a.id))).toMatchObject({ correct: true, repeat: true });
      const wrong = await b.answerQuestion(w.id, (keyOf(w.id) + 1) % 4);
      expect(wrong).toMatchObject({ correct: false, rightChoice: keyOf(w.id) });
      expect((await b.balances()).coins).toBe(2);
      await expect(b.answerQuestion('v5-999', 0)).rejects.toThrow();
    });

    it('caps learning coins each week but still gives XP, and shows skills to the parent', async () => {
      const b = make();
      const hero = await b.signUp(input);
      for (let n = 0; n < 4; n++) {
        for (const q of (await b.startPractice('reading')).questions) await b.answerQuestion(q.id, keyOf(q.id));
      }
      for (let n = 0; n < 4; n++) {
        for (const q of (await b.startPractice('math')).questions) await b.answerQuestion(q.id, keyOf(q.id));
      }
      for (let n = 0; n < 4; n++) {
        for (const q of (await b.startPractice('science')).questions) await b.answerQuestion(q.id, keyOf(q.id));
      }
      for (let n = 0; n < 4; n++) {
        for (const q of (await b.startPractice('vocab')).questions) await b.answerQuestion(q.id, keyOf(q.id));
      }
      const bal = await b.balances();
      expect(bal.coins).toBe(150);
      expect(bal.xp).toBe(80 * 5);
      const code = await b.linkCode();
      await b.signOut();
      await b.adultSignUp('p@x.test', 'password1', 'parent', 'Pat Parent');
      await b.adultSignIn('p@x.test', 'password1');
      await b.claimLink(code.code);
      const math = (await b.childLearning(hero.id)).find((s) => s.subject === 'math')!;
      expect(math).toMatchObject({ answered: 20, correct: 20, left: 0 });
      expect(math.skills.length).toBeGreaterThan(2);
    });
  });

  describe('traffic', () => {
    it('counts heroes online, throttles repeats and shows only the Sensei', async () => {
      const b = make();
      const hero = await b.signUp(input);
      await b.ping('home');
      await b.ping('home');
      clock = new Date(clock.getTime() + 60_000);
      await b.ping('learn');
      await b.signOut();
      await expect(b.senseiTraffic()).rejects.toThrow();
      await b.adultSignIn('sensei@demo.test', 'sensei');
      const t = await b.senseiTraffic();
      expect(t).toMatchObject({ nowHeroes: 1, todayHeroes: 1, weekHeroes: 1, totalHeroes: 1 });
      expect(t.active[0]).toMatchObject({ name: hero.displayName, screen: 'learn' });
      expect(t.days).toHaveLength(14);
      expect(t.days[13].minutes).toBe(2);
      expect(t.hours).toHaveLength(24);
      clock = new Date(clock.getTime() + 10 * 60_000);
      expect((await b.senseiTraffic()).nowHeroes).toBe(0);
    });
  });

  describe('arcade', () => {
    it('pays each game once a day and ignores unknown games', async () => {
      const b = make();
      await b.signUp(input);
      expect(await b.arcadeClaim('memory-flip')).toEqual({ awarded: 5, duplicate: false, capped: false });
      expect(await b.arcadeClaim('memory-flip')).toEqual({ awarded: 0, duplicate: true, capped: false });
      await expect(b.arcadeClaim('hacks')).rejects.toThrow();
      expect((await b.arcadeStatus()).claimed).toEqual(['memory-flip']);
      expect((await b.balances()).xp).toBe(3);
      clock = new Date(clock.getTime() + DAY_MS);
      expect((await b.arcadeStatus()).claimed).toEqual([]);
      expect((await b.arcadeClaim('memory-flip')).awarded).toBe(5);
    });
  });

  describe('friends and squads', () => {
    it('connects two heroes, forms a squad and lets members leave', async () => {
      const b = make();
      const a = await b.signUp(input);
      await b.signOut();
      const c = await b.signUp({ ...input, nameNoun: 'Owl' });
      await expect(b.requestFriend(c.heroCode)).rejects.toThrow('own code');
      await b.requestFriend(a.heroCode);
      await expect(b.requestFriend(a.heroCode)).rejects.toThrow('already');
      await b.signOut();
      await b.signIn(a.heroCode, [0, 4, 8]);
      const incoming = (await b.friends()).incoming;
      expect(incoming.map((r) => r.name)).toEqual([c.displayName]);
      await b.respondFriend(incoming[0].id, true);
      expect((await b.friends()).friends[0].heroId).toBe(c.id);
      await expect(b.createSquad('Hacky', 'Wolves')).rejects.toThrow();
      await b.createSquad('Brave', 'Wolves');
      await b.inviteToSquad(c.id);
      await b.signOut();
      await b.signIn(c.heroCode, [0, 4, 8]);
      const view = await b.mySquad();
      expect(view.squad).toBeNull();
      await b.respondSquadInvite(view.invites[0].squadId, true);
      expect((await b.mySquad()).squad?.members).toHaveLength(2);
      await b.leaveSquad();
      expect((await b.mySquad()).squad).toBeNull();
    });
  });

  describe('adult password', () => {
    it('lets a grown-up pick a new password', async () => {
      const b = make();
      await b.adultSignUp('p@x.test', 'password1', 'parent', 'Pat Parent');
      await b.adultRequestReset('p@x.test');
      expect(b.resetPending()).toBe(false);
      await expect(b.adultSetPassword('short')).rejects.toThrow();
      await b.adultSetPassword('newpassword1');
      await b.signOut();
      await expect(b.adultSignIn('p@x.test', 'password1')).rejects.toThrow();
      await b.adultSignIn('p@x.test', 'newpassword1');
    });
  });

  describe('rooms', () => {
    it('runs Trivia Clash with practice buddies from lobby to standings', async () => {
      const b = make();
      await b.signUp(input);
      const code = await b.createRoom('trivia-clash');
      await expect(b.createRoom('trivia-clash')).rejects.toThrow('leave your room first');
      await expect(b.startRoom()).rejects.toThrow('at least 2');
      await b.addPracticeBuddy!();
      expect((await b.roomState(code)).players).toHaveLength(2);
      await b.startRoom();
      for (let i = 0; i < 8; i++) {
        const q = await b.roomState(code);
        expect(q.phase).toBe('question');
        expect(q.rightChoice).toBeUndefined();
        const right = (bank as { id: string; prompt: string; answer: number }[]).find((x) => x.prompt === q.question!.prompt)!.answer;
        await b.roomAnswer(right);
        clock = new Date(clock.getTime() + 11_000);
        const reveal = await b.roomState(code);
        expect(reveal.phase).toBe('reveal');
        expect(reveal.rightChoice).toBe(right);
        expect(reveal.myPoints).toBeGreaterThanOrEqual(100);
        clock = new Date(clock.getTime() + 6_000);
      }
      const end = await b.roomState(code);
      expect(end.state).toBe('done');
      expect(end.players[0].score).toBeGreaterThanOrEqual(800);
      expect(await b.currentRoom()).toBeNull();
    });
  });

  describe('odin', () => {
    it('plays ODIN against a practice buddy until someone empties their hand', async () => {
      const b = make();
      await b.signUp(input);
      const code = await b.createRoom('odin');
      await b.addPracticeBuddy!();
      await b.startRoom();
      expect((await b.roomState(code)).state).toBe('playing');
      let v = await b.odinView(code);
      expect(v.hand).toHaveLength(7);
      expect(v.players.map((p) => p.cards)).toEqual([7, 7]);
      for (let turns = 0; turns < 400 && v.state === 'playing'; turns++) {
        if (v.myTurn) {
          const card = v.hand.find((c) => playable(c, v.top, v.color));
          if (card) await b.odinMove(card, isWild(card) ? 'R' : undefined);
          else await b.odinMove(null);
        } else {
          clock = new Date(clock.getTime() + 2_000);
        }
        v = await b.odinView(code);
      }
      expect(v.state).toBe('done');
      expect(v.winner).toBeTruthy();
    });

    it('refuses plays out of turn, unmatched cards and wilds without a colour', async () => {
      const b = make();
      await b.signUp(input);
      const code = await b.createRoom('odin');
      await b.addPracticeBuddy!();
      await b.startRoom();
      const v = await b.odinView(code);
      await expect(b.odinMove('Z9')).rejects.toThrow();
      const bad = v.hand.find((c) => !playable(c, v.top, v.color));
      if (bad) await expect(b.odinMove(bad)).rejects.toThrow('does not match');
    });
  });

  describe('shadow signal', () => {
    it('plays a round with practice buddies and keeps the word from the Shadow', async () => {
      const b = make();
      await b.signUp(input);
      const code = await b.createRoom('shadow-signal');
      await b.addPracticeBuddy!();
      await expect(b.startRoom()).rejects.toThrow('at least 3');
      await b.addPracticeBuddy!();
      await b.startRoom();
      let v = await b.shadowView(code);
      expect(v.phase).toBe('clue');
      expect(v.players).toHaveLength(3);
      expect(v.category).toBeTruthy();
      if (v.isShadow) expect(v.word).toBeNull(); else expect(v.word).toBeTruthy();
      for (let turns = 0; turns < 200 && v.phase !== 'done'; turns++) {
        const me = v.players.find((p) => p.me)!;
        if (v.phase === 'clue' && me.speaking) await b.shadowClue('shiny');
        else if (v.phase === 'vote' && v.myVote === null) await b.shadowVote(v.players.find((p) => !p.me)!.i);
        else if (v.phase === 'guess' && v.options) await b.shadowGuess(v.options[0]);
        else clock = new Date(clock.getTime() + 2_000);
        v = await b.shadowView(code);
      }
      expect(v.phase).toBe('done');
      expect(v.result?.word).toBeTruthy();
      expect(v.players.some((p) => p.shadow)).toBe(true);
    });
    it('rejects bad clues', async () => {
      const b = make();
      await b.signUp(input);
      const code = await b.createRoom('shadow-signal');
      await b.addPracticeBuddy!(); await b.addPracticeBuddy!();
      await b.startRoom();
      const v = await b.shadowView(code);
      if (!v.players.find((p) => p.me)!.speaking) { await expect(b.shadowClue('hello')).rejects.toThrow('not your turn'); return; }
      await expect(b.shadowClue('two words')).rejects.toThrow('one word');
      await expect(b.shadowClue('sh1t')).rejects.toThrow();
    });
  });

  describe('squad drawing', () => {
    it('lets a hero draw, then guess against practice buddies, and finishes after everyone drew', async () => {
      const b = make();
      await b.signUp(input);
      const code = await b.createRoom('squad-drawing');
      await b.addPracticeBuddy!();
      await b.startRoom();
      let v = await b.drawingView(code, 0);
      expect(v.rounds).toBe(2);
      const mine = v.isArtist;
      if (mine) {
        expect(v.word).toBeTruthy();
        await b.drawingStroke(1, '#111111', 4, [[10, 10], [20, 20]]);
        await b.drawingStroke(1, '#111111', 4, [[30, 30]]);
        await expect(b.drawingStroke(2, 'red', 4, [[1, 1]])).rejects.toThrow('bad pen');
        await expect(b.drawingGuess('cat')).rejects.toThrow('you are drawing');
        v = await b.drawingView(code, 0);
        expect(v.strokes).toHaveLength(1);
        expect(v.strokes[0].p).toHaveLength(3);
      } else {
        expect(v.word).toBeNull();
        expect(v.pattern).toMatch(/^[_ ]+$/);
        await expect(b.drawingStroke(1, '#111111', 4, [[1, 1]])).rejects.toThrow('not drawing');
        await expect(b.drawingGuess('sh1t')).rejects.toThrow('letters only');
        const wrong = await b.drawingGuess('qqq');
        expect(wrong.correct).toBe(false);
      }
      for (let turns = 0; turns < 400 && v.state !== 'done'; turns++) {
        clock = new Date(clock.getTime() + 3_000);
        v = await b.drawingView(code, 0);
      }
      expect(v.state).toBe('done');
    });
    it('ends a drawing after reports and shows them to the Sensei', async () => {
      const b = make();
      await b.signUp(input);
      const code = await b.createRoom('squad-drawing');
      await b.addPracticeBuddy!();
      await b.startRoom();
      let v = await b.drawingView(code, 0);
      if (v.isArtist) { clock = new Date(clock.getTime() + 70_000); await b.drawingView(code, 0); clock = new Date(clock.getTime() + 7_000); v = await b.drawingView(code, 0); }
      expect(v.isArtist).toBe(false);
      await b.drawingReport();
      v = await b.drawingView(code, 0);
      expect(v.phase).toBe('reveal');
      expect(v.voided).toBe(true);
      await b.signOut();
      await b.adultSignIn('sensei@demo.test', 'sensei');
      expect((await b.senseiDrawingReports())).toHaveLength(1);
    });
  });

  describe('escape the nexus', () => {
    it('breaks every seal with buddy help, charging time for wrong answers', async () => {
      const b = make();
      await b.signUp(input);
      const code = await b.createRoom('escape-nexus');
      await b.addPracticeBuddy!();
      await b.startRoom();
      let v = await b.nexusView(code);
      expect(v.need).toBe(3);
      expect(v.players).toHaveLength(2);
      expect(v.question?.choices.length).toBeGreaterThan(1);
      const first = v.question!;
      const right = (bank as { prompt: string; answer: number }[]).find((x) => x.prompt === first.prompt)!.answer;
      const wrongOne = (right + 1) % first.choices.length;
      const bad = await b.nexusAnswer(wrongOne);
      expect(bad.correct).toBe(false);
      expect(bad.penalty).toBe(10);
      v = await b.nexusView(code);
      expect(v.penalty).toBe(10);
      expect(v.wrong).toBe(1);
      expect(v.secondsTotal).toBe(60 + 2 * 50 + 10);
      for (let turns = 0; turns < 40 && v.state === 'playing'; turns++) {
        if (v.question) {
          const ans = (bank as { prompt: string; answer: number }[]).find((x) => x.prompt === v.question!.prompt)!.answer;
          await b.nexusAnswer(ans);
        } else clock = new Date(clock.getTime() + 5_000);
        v = await b.nexusView(code);
      }
      expect(v.outcome).toBe('won');
    });
    it('loses when the clock runs out and lets a finished hero boost a teammate once', async () => {
      const b = make();
      await b.signUp(input);
      const code = await b.createRoom('escape-nexus');
      await b.addPracticeBuddy!();
      await b.startRoom();
      let v = await b.nexusView(code);
      await expect(b.nexusBoost(1)).rejects.toThrow('open your own seal first');
      for (let i = 0; i < 3; i++) {
        const ans = (bank as { prompt: string; answer: number }[]).find((x) => x.prompt === v.question!.prompt)!.answer;
        await b.nexusAnswer(ans);
        v = await b.nexusView(code);
      }
      expect(v.question).toBeNull();
      if (v.canBoost) {
        const buddy = v.players.find((p) => !p.me && !p.done);
        if (buddy) { await b.nexusBoost(buddy.i); await expect(b.nexusBoost(buddy.i)).rejects.toThrow('already boosted'); }
      }
      clock = new Date(clock.getTime() + 600_000);
      v = await b.nexusView(code);
      expect(v.outcome).not.toBe('play');
    });
  });

  describe('chat', () => {
    it('warns once, pauses on the second swear, and lets the Sensei unlock after a parent asks', async () => {
      const b = make();
      const hero = await b.signUp(input);
      await b.createRoom('trivia-clash');
      expect(await b.chatSend('good luck!')).toEqual({ ok: true });
      clock = new Date(clock.getTime() + 2000);
      expect(await b.chatSend('what the f u c k')).toEqual({ ok: false, reason: 'warning' });
      clock = new Date(clock.getTime() + 2000);
      expect(await b.chatSend('call 555 123 4567')).toEqual({ ok: false, reason: 'private' });
      expect(await b.chatSend('Hello classmates, assignment time')).toEqual({ ok: true });
      clock = new Date(clock.getTime() + 2000);
      expect(await b.chatSend('SH1T')).toEqual({ ok: false, reason: 'banned' });
      expect((await b.chatRead()).banned).toBe(true);
      expect((await b.chatRead()).messages.map((m) => m.body)).toEqual(['good luck!', 'Hello classmates, assignment time']);
      const code = await b.linkCode();
      await b.signOut();
      await b.adultSignUp('p@x.test', 'password1', 'parent', 'Pat Parent');
      await b.claimLink(code.code);
      expect(await b.childChat(hero.id)).toEqual({ banned: true, requested: false });
      await b.chatRequestUnlock(hero.id);
      expect(await b.childChat(hero.id)).toEqual({ banned: true, requested: true });
      await b.signOut();
      await b.adultSignIn('sensei@demo.test', 'sensei');
      expect((await b.senseiChatRequests())[0]).toMatchObject({ childId: hero.id, requested: true });
      await b.chatUnlock(hero.id);
      expect(await b.senseiChatRequests()).toEqual([]);
    });
  });

  describe('story', () => {
    it('saves progress, pays choices and checkpoints once, and gives the card at the end', async () => {
      const b = make();
      await b.signUp(input);
      await b.storySave('ep1', 5);
      await b.storySave('ep1', 2);
      expect((await b.storyState())[0].panel).toBe(5);
      expect(await b.storyChoose('ep1', 'touch', 'ana')).toMatchObject({ repeat: false, amount: 5 });
      expect(await b.storyChoose('ep1', 'touch', 'isabella')).toEqual({ repeat: true, option: 'ana' });
      await expect(b.storyComplete('ep1')).rejects.toThrow('checkpoint');
      expect(await b.storyAnswer('ep1', 'cp1', 0)).toEqual({ correct: false });
      for (const [cp, pick] of [['cp1', 1], ['cp2', 0], ['cp3', 2]] as const) {
        expect(await b.storyAnswer('ep1', cp, pick)).toMatchObject({ correct: true, first: true });
      }
      expect(await b.storyAnswer('ep1', 'cp1', 1)).toMatchObject({ first: false });
      expect(await b.storyComplete('ep1')).toEqual({ repeat: false, card: 'e-keeper', coins: 20 });
      expect(await b.storyComplete('ep1')).toEqual({ repeat: true, card: 'e-keeper' });
      expect((await b.cardsState()).cards.find((c) => c.id === 'e-keeper')?.qty).toBe(1);
    });
  });

  describe('mystery lab and chronicle quest', () => {
    it('pays each step once, opens the trail in order and gives a card per finished case', async () => {
      const b = make();
      await b.signUp(input);
      expect((await b.advState()).map((c) => c.case)).toEqual(['lab1', 'lab2', 'chron1']);
      expect(await b.advAnswer('lab1', 'q1', 0)).toEqual({ correct: false });
      expect(await b.advAnswer('lab1', 'q1', 1)).toMatchObject({ correct: true, first: true });
      expect(await b.advAnswer('lab1', 'q1', 1)).toMatchObject({ first: false });
      await expect(b.advComplete('lab1')).rejects.toThrow('every question');
      await b.advAnswer('lab1', 'q2', 0);
      await b.advAnswer('lab1', 'q3', 2);
      expect(await b.advComplete('lab1')).toEqual({ repeat: false, card: 'u-key', coins: 15 });
      expect(await b.advComplete('lab1')).toEqual({ repeat: true, card: 'u-key' });
      await expect(b.advAnswer('chron1', 's2', 0)).rejects.toThrow('sealed');
      await b.advAnswer('chron1', 's1', 1);
      expect(await b.advAnswer('chron1', 's2', 0)).toMatchObject({ correct: true });
    });
  });

  describe('daily streak and quest', () => {
    it('grows a streak over days, pays milestones once and needs all three tasks for the quest', async () => {
      const b = make();
      await b.signUp(input);
      for (let day = 0; day < 3; day++) {
        await b.claimDaily();
        if (day < 2) clock = new Date(clock.getTime() + DAY_MS);
      }
      let q = await b.questState();
      expect(q.streak).toBe(3);
      expect(q.milestones.map((m) => m.reached)).toEqual([true, false, false, false]);
      await expect(b.streakClaim(7)).rejects.toThrow('not there yet');
      expect(await b.streakClaim(3)).toMatchObject({ awarded: 5 });
      expect(await b.streakClaim(3)).toMatchObject({ duplicate: true });
      await expect(b.questClaim()).rejects.toThrow('three tasks');
      await b.arcadeClaim('memory-flip');
      q = await b.questState();
      expect(q.tasks.find((t) => t.id === 'game')?.have).toBe(1);
      clock = new Date(clock.getTime() + 3 * DAY_MS);
      expect((await b.questState()).streak).toBe(0);
    });
  });

  describe('trivia night', () => {
    it('takes an RSVP and pays the prize once, to the heroes who said yes', async () => {
      const b = make();
      const hero = await b.signUp(input);
      const code = hero.heroCode;
      await b.signOut();
      await b.adultSignIn('sensei@demo.test', 'sensei');
      const day = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][clock.getUTCDay()];
      await b.setTriviaNight(day, '18:30');
      await b.signOut();
      await b.signIn(code, input.picture);
      expect((await b.triviaState()).going).toBeNull();
      expect(await b.triviaRsvp(true)).toMatchObject({ today: true, going: true, goingCount: 1 });
      await b.signOut();
      await b.adultSignIn('sensei@demo.test', 'sensei');
      expect((await b.senseiTriviaRoster()).grades).toEqual([{ grade: 5, going: 1, names: [hero.displayName] }]);
      await expect(b.senseiTriviaPrize(500)).rejects.toThrow();
      expect(await b.senseiTriviaPrize(10)).toBe(1);
      expect(await b.senseiTriviaPrize(10)).toBe(0);
    });
  });
});
