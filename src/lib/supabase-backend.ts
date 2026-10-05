import { createClient } from '@supabase/supabase-js';
import {
  AdultAuthError, SignInError, emptyBalances,
  type Adult, type Backend, type ClassMission, type ClassResult, type Hero, type HomeMission, type Identity,
  type NewClassMission, type QuizQuestion, type SignUpInput, type SubjectProgress, type TriviaState,
} from './backend.ts';
import type { Currency } from '../../supabase/functions/_shared/rewards.ts';


const home = (r: any): HomeMission => ({
  id: r.id, childId: r.child_id, title: r.title, details: r.details, coins: r.coins, status: r.status,
});
const classResult = (r: any): ClassResult => ({
  correct: r.correct, total: r.total, scorePct: r.score_pct, coins: r.coins, passed: r.passed ?? r.score_pct >= 80,
  alreadyDone: r.already_done,
  review: r.review?.map((x: any) => ({ correct: x.correct, rightChoice: x.right_choice, explanation: x.explanation })),
});

const triviaOf = (d: any): TriviaState => ({ date: d.date, time: d.time, today: d.today, going: d.going, goingCount: Number(d.going_count) });
const surgeOf = (d: any) => ({ active: d.active, secondsLeft: d.seconds_left, streak: d.streak, need: d.need, mult: Number(d.mult), started: d.started });

export function createSupabaseBackend(url: string, publishableKey: string): Backend {
  const sb = createClient(url, publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });

  const subjectProgress = (d: any[]): SubjectProgress[] => d.map((x) => ({
    subject: x.subject, answered: x.answered, correct: x.correct, left: x.left, skills: x.skills,
  }));
  const rpc = async (fn: string, args?: Record<string, unknown>): Promise<any> => {
    const { data, error } = await sb.rpc(fn, args);
    if (error) throw new Error(error.message);
    return data;
  };
  const rows = async (q: PromiseLike<{ data: any; error: any }>): Promise<any[]> => {
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data ?? [];
  };

  // The hero is remembered on this device so the app can open without Wi-Fi (practice then works offline).
  const HERO_KEY = 'hh-hero-cache';
  const saveHero = (h: Hero | null) => { try { if (h) localStorage.setItem(HERO_KEY, JSON.stringify(h)); else localStorage.removeItem(HERO_KEY); } catch { /* blocked storage */ } };
  const savedHero = (): Hero | null => { try { const v = localStorage.getItem(HERO_KEY); return v ? (JSON.parse(v) as Hero) : null; } catch { return null; } };

  async function loadHero(): Promise<Hero | null> {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data, error } = await sb.from('heroes').select('*').eq('id', session.user.id).maybeSingle();
    if (error || !data) {
      const saved = savedHero();
      return saved && saved.id === session.user.id && typeof navigator !== 'undefined' && navigator.onLine === false ? saved : null;
    }
    const hero: Hero = { id: data.id, heroCode: data.hero_code, friendCode: data.friend_code, displayName: data.display_name, grade: data.grade, starter: data.starter_hero };
    saveHero(hero);
    return hero;
  }

  async function loadAdult(): Promise<Adult | null> {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data, error } = await sb.from('adults').select('*').eq('id', session.user.id).maybeSingle();
    if (error || !data) return null;
    return { id: data.id, role: data.role, displayName: data.display_name, approved: data.approved };
  }

  async function signInWithFunction(heroCode: string, picture: number[]): Promise<Hero> {
    const { data, error } = await sb.functions.invoke('kid-signin', { body: { heroCode, picture } });
    if (error) {
      const res = (error as { context?: Response }).context;
      const body = res && typeof res.json === 'function' ? await res.json().catch(() => null) : null;
      if (body?.error === 'resting') throw new SignInError('resting', { retryAfter: body.retryAfter });
      if (body?.error === 'wrong_code_or_pictures') throw new SignInError('wrong', { triesLeft: body.triesLeft });
      throw new SignInError('network');
    }
    await sb.auth.setSession(data.session);
    const hero = await loadHero();
    if (!hero) throw new SignInError('network');
    return hero;
  }

  /** Creates the grown-up profile from what they chose at sign-up (kept in their account data). */
  async function ensureAdultProfile(): Promise<Adult> {
    const existing = await loadAdult();
    if (existing) return existing;
    const { data: { user } } = await sb.auth.getUser();
    const meta = user?.user_metadata ?? {};
    await rpc('register_adult', { p_role: meta.role, p_name: meta.name });
    const created = await loadAdult();
    if (!created) throw new AdultAuthError('network');
    return created;
  }

  return {
    mode: 'supabase',

    async restore(): Promise<Identity> {
      const hero = await loadHero();
      if (hero) return { kind: 'hero', hero };
      const adult = await loadAdult();
      return adult ? { kind: 'adult', adult } : null;
    },
    async signOut() {
      saveHero(null);
      await sb.auth.signOut();
    },

    // ---- Heroes -----------------------------------------------------------------------
    async signUp(input: SignUpInput) {
      const { data, error } = await sb.functions.invoke('kid-signup', { body: input });
      if (error || !data?.heroCode) throw new Error('signup_failed');
      return signInWithFunction(data.heroCode, input.picture);
    },
    signIn: signInWithFunction,
    async balances() {
      const out = emptyBalances();
      for (const row of await rows(sb.from('my_balances').select('currency, balance'))) out[row.currency as Currency] = row.balance;
      return out;
    },
    async dailyStatus() {
      const d = await rpc('daily_reward_status');
      return { available: d.available, amount: d.amount };
    },
    async claimDaily() {
      const d = await rpc('claim_daily_reward');
      return { awarded: d.awarded, duplicate: d.duplicate };
    },
    async linkCode() {
      const d = await rpc('create_link_code');
      return { code: d.code, expiresAt: d.expires_at };
    },
    async homeMissions() {
      return (await rows(sb.from('home_missions').select('*').order('created_at', { ascending: false }))).map(home);
    },
    async submitHomeMission(id) {
      await rpc('submit_home_mission', { p_id: id });
    },
    async myClass() {
      const [row] = await rows(sb.from('class_members').select('classes(id, name, grade)').limit(1));
      const c = row?.classes;
      return c ? { id: c.id, name: c.name, grade: c.grade } : null;
    },
    async joinClass(code) {
      const d = await rpc('join_class', { p_code: code });
      return d.ok ? { ok: true, name: d.name } : { ok: false, error: d.error };
    },
    async classMissions() {
      const missions = await rows(sb.from('class_missions').select('*').order('created_at', { ascending: false }));
      const subs = await rows(sb.from('class_submissions').select('*').is('reset_at', null));
      return missions.map((m): ClassMission => {
        const s = subs.find((x) => x.mission_id === m.id);
        return {
          id: m.id, title: m.title, passage: m.passage, questions: m.questions as QuizQuestion[], maxCoins: m.max_coins,
          result: s && { correct: s.correct, total: s.total, scorePct: s.score_pct, coins: s.coins_awarded, passed: s.score_pct >= 80, alreadyDone: true },
        };
      });
    },
    async submitClassMission(id, answers) {
      return classResult(await rpc('submit_class_mission', { p_mission: id, p_answers: answers }));
    },
    async announcements() {
      const items = (await rows(sb.from('announcements').select('*').order('id', { ascending: false }).limit(20)))
        .map((a) => ({ id: a.id, title: a.title, body: a.body, createdAt: a.created_at }));
      return { items, unread: await rpc('unread_announcements') };
    },
    async senseiDeleteAnnouncement(id) {
      await rpc('sensei_delete_announcement', { p_id: id });
    },
    async teacherCharacter() {
      return await rpc('teacher_character_get');
    },
    async teacherCharacterWish(wish) {
      await rpc('teacher_character_wish', { p_wish: wish });
    },
    async teacherCharacterSubmit(photo, wish) {
      await rpc('teacher_character_submit', { p_photo: photo, p_wish: wish });
    },
    async teacherCharacterRespond(approve, note) {
      await rpc('teacher_character_respond', { p_approve: approve, p_note: note });
    },
    async teacherCharacterRemovePhoto() {
      await rpc('teacher_character_remove_photo');
    },
    async senseiCharacterQueue() {
      return (await rpc('sensei_character_queue')) ?? [];
    },
    async senseiCharacterDeliver(teacherId, art, note) {
      await rpc('sensei_character_deliver', { p_teacher: teacherId, p_art: art, p_note: note });
    },
    async aiStatus() {
      const { data, error } = await sb.functions.invoke('lesson-ai', { body: { action: 'status' } });
      if (error || !data) return { configured: false, limit: 0, left: 0 };
      return { configured: !!data.configured, limit: data.limit ?? 0, left: data.left ?? 0 };
    },
    async aiDraftQuiz(lesson, grade, count) {
      const { data, error } = await sb.functions.invoke('lesson-ai', { body: { lesson, grade, count } });
      let code: string | undefined = data?.error;
      if (!code && error) {
        const ctx = (error as { context?: Response }).context;
        code = await ctx?.json?.().then((j: { error?: string }) => j?.error).catch(() => undefined);
      }
      if (code || !data?.quiz) throw new Error(code ?? 'ai_unavailable');
      return { ...data.quiz, left: data.left };
    },
    async markAnnouncementsRead() {
      await rpc('mark_announcements_read');
    },

    // ---- Grown-ups ----------------------------------------------------------------------
    async adultSignUp(email, password, role, name) {
      const { data, error } = await sb.auth.signUp({ email, password, options: { data: { role, name } } });
      if (error) {
        if (error.code === 'user_already_exists') throw new AdultAuthError('taken');
        if (error.code === 'weak_password') throw new AdultAuthError('weak');
        throw new AdultAuthError('network');
      }
      // Email confirmation on: no session yet. The profile is created on first sign-in.
      if (!data.session) return 'confirm_email';
      return ensureAdultProfile();
    },
    async adultSignIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new AdultAuthError(error.code === 'email_not_confirmed' ? 'network' : 'wrong');
      return ensureAdultProfile();
    },
    async adultRequestReset(email) {
      await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` }).catch(() => undefined);
    },
    resetPending() {
      return window.location.hash.includes('type=recovery');
    },
    async adultSetPassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new AdultAuthError(error.code === 'weak_password' ? 'weak' : 'network');
      window.history.replaceState(null, '', window.location.pathname);
    },
    async claimLink(code) {
      const d = await rpc('claim_link_code', { p_code: code });
      return d.ok ? { ok: true, childName: d.display_name } : { ok: false, error: d.error };
    },
    async children() {
      return ((await rpc('my_children')) as any[]).map((c) => ({
        id: c.id, displayName: c.display_name, grade: c.grade, starter: c.starter_hero, waiting: c.waiting,
      }));
    },
    async childMissions(childId) {
      return (await rows(sb.from('home_missions').select('*').eq('child_id', childId).order('created_at', { ascending: false }))).map(home);
    },
    async childWeek(childId, weeksBack = 0) {
      const d = await rpc('child_week', { p_child: childId, p_weeks_back: weeksBack });
      return { weekStart: d.week_start, daysActive: d.days_active, answered: d.answered, correct: d.correct, subjects: d.subjects, points: Number(d.points), missions: d.missions };
    },
    async myWeek(weeksBack = 0) {
      const d = await rpc('my_week', { p_weeks_back: weeksBack });
      return { weekStart: d.week_start, daysActive: d.days_active, answered: d.answered, correct: d.correct, subjects: d.subjects, points: Number(d.points), missions: d.missions };
    },
    async classReport(classId, weeksBack = 0) {
      const d = await rpc('class_report', { p_class: classId, p_weeks_back: weeksBack });
      return {
        weekStart: d.week_start, className: d.class_name,
        students: (d.students ?? []).map((x: any) => ({ id: x.id, name: x.name, daysActive: x.days_active, answered: x.answered, correct: x.correct, points: Number(x.points), missions: x.missions })),
      };
    },
    async childProgress(childId) {
      const d = await rpc('child_progress', { p_child: childId });
      return { coins: d.coins, xp: d.xp, homeWeek: d.home_week, classWeek: d.class_week, homeCap: d.home_cap, classCap: d.class_cap };
    },
    async startPractice(subject) {
      const d = await rpc('start_practice', { p_subject: subject });
      return { questions: d.questions, remaining: d.remaining };
    },
    async answerQuestion(questionId, choice) {
      const d = await rpc('answer_question', { p_question: questionId, p_choice: choice });
      return {
        correct: d.correct, rightChoice: d.right_choice, explanation: d.explanation, repeat: d.repeat,
        awarded: d.awarded?.xp === undefined ? undefined
          : { coins: Number(d.awarded.coins), xp: d.awarded.xp, skillPoints: d.awarded.skill_points, capped: !!d.awarded.capped },
        surge: d.surge && surgeOf(d.surge),
      };
    },
    async learning() {
      return subjectProgress(await rpc('my_learning'));
    },
    async childLearning(childId) {
      return subjectProgress(await rpc('child_learning', { p_child: childId }));
    },
    async createHomeMission(childId, title, details, coins) {
      await rpc('create_home_mission', { p_child: childId, p_title: title, p_details: details, p_coins: coins });
    },
    async reviewHomeMission(id, approve) {
      const d = await rpc('review_home_mission', { p_id: id, p_approve: approve });
      return { status: d.status, awarded: d.awarded, capped: d.capped };
    },
    async classes() {
      return (await rows(sb.from('classes').select('id, name, grade, join_code, class_members(count)').order('created_at')))
        .map((c) => ({ id: c.id, name: c.name, grade: c.grade, joinCode: c.join_code, members: c.class_members?.[0]?.count ?? 0 }));
    },
    async createClass(name, grade) {
      const c = await rpc('create_class', { p_name: name, p_grade: grade });
      return { id: c.id, name: c.name, grade: c.grade, joinCode: c.join_code, members: 0 };
    },
    async createClassMission(classId, m: NewClassMission) {
      await rpc('create_class_mission', {
        p_class: classId, p_title: m.title, p_passage: m.passage, p_questions: m.questions, p_answers: m.answers,
        p_explanations: m.explanations, p_max_coins: m.maxCoins,
      });
    },
    async classResults(classId) {
      const missions = await rows(sb.from('class_missions').select('id, title').eq('class_id', classId).order('created_at', { ascending: false }));
      if (!missions.length) return [];
      const subs = await rows(sb.from('class_submissions').select('mission_id, child_id, score_pct, coins_awarded, heroes(display_name)')
        .in('mission_id', missions.map((m) => m.id)).is('reset_at', null));
      return missions.map((m) => ({
        id: m.id, title: m.title,
        submissions: subs.filter((s) => s.mission_id === m.id).map((s) => ({
          childId: s.child_id, childName: s.heroes?.display_name ?? 'Hero', scorePct: s.score_pct, coins: s.coins_awarded,
        })),
      }));
    },
    async resetSubmission(missionId, childId) {
      await rpc('teacher_reset_submission', { p_mission: missionId, p_child: childId });
    },
    async arcadeStatus() {
      const d = await rpc('arcade_status');
      return { coins: d.coins, games: d.games, claimed: d.claimed };
    },
    async arcadeClaim(game) {
      const d = await rpc('arcade_claim', { p_game: game });
      return { awarded: d.awarded, duplicate: d.duplicate, capped: d.capped };
    },
    async friends() {
      const d = await rpc('my_friends');
      return {
        friends: d.friends.map((f: any) => ({ id: f.id, heroId: f.hero_id, name: f.name, grade: f.grade, starter: f.starter })),
        incoming: d.incoming.map((f: any) => ({ id: f.id, name: f.name, grade: f.grade, starter: f.starter })),
        outgoing: d.outgoing,
      };
    },
    async requestFriend(code) {
      const d = await rpc('friend_request', { p_code: code });
      if (!d.name) throw new Error('no hero has that code');
      return d.name;
    },
    async friendCodeReset() {
      return rpc('friend_code_reset');
    },
    async respondFriend(id, accept) {
      await rpc('friend_respond', { p_id: id, p_accept: accept });
    },
    async removeFriend(id) {
      await rpc('friend_remove', { p_id: id });
    },
    async mySquad() {
      const d = await rpc('my_squad');
      return {
        squad: d.squad && {
          id: d.squad.id, name: d.squad.name, leader: d.squad.leader,
          members: d.squad.members.map((m: any) => ({ heroId: m.hero_id, name: m.name, starter: m.starter, status: m.status, isLeader: m.is_leader })),
        },
        invites: d.invites.map((i: any) => ({ squadId: i.squad_id, name: i.name, leaderName: i.leader_name })),
      };
    },
    async createSquad(adjective, noun) {
      await rpc('squad_create', { p_adjective: adjective, p_noun: noun });
    },
    async inviteToSquad(friendHeroId) {
      await rpc('squad_invite', { p_friend: friendHeroId });
    },
    async respondSquadInvite(squadId, accept) {
      await rpc('squad_respond', { p_squad: squadId, p_accept: accept });
    },
    async leaveSquad() {
      await rpc('squad_leave');
    },
    async cardsState() {
      return rpc('cards_state');
    },
    async openPack() {
      return rpc('card_open_pack');
    },
    async setShowcase(cardIds) {
      await rpc('card_set_showcase', { p_cards: cardIds });
    },
    async tradeOpen(friendHeroId) {
      return rpc('trade_open', { p_friend: friendHeroId });
    },
    async tradeList() {
      return (await rpc('trade_list')).map((t: any) => ({ id: t.id, friend: t.friend, friendId: t.friend_id, startedByMe: t.started_by_me }));
    },
    async tradeView(tradeId) {
      const d = await rpc('trade_view', { p_trade: tradeId });
      return {
        id: d.id, status: d.status, ver: d.ver, friend: d.friend, friendId: d.friend_id, myOffer: d.my_offer, theirOffer: d.their_offer,
        iConfirmed: d.i_confirmed, theyConfirmed: d.they_confirmed, fairness: { level: d.fairness.level, iGiveMore: !!d.fairness.i_give_more },
      };
    },
    async tradeSet(tradeId, offer) {
      await rpc('trade_set', { p_trade: tradeId, p_offer: offer });
    },
    async tradeConfirm(tradeId, ver, ack) {
      return rpc('trade_confirm', { p_trade: tradeId, p_ver: ver, p_ack: ack });
    },
    async tradeCancel(tradeId) {
      await rpc('trade_cancel', { p_trade: tradeId });
    },
    async triviaState() {
      return triviaOf(await rpc('trivia_state'));
    },
    async triviaRsvp(going) {
      return triviaOf(await rpc('trivia_rsvp', { p_going: going }));
    },
    async senseiTriviaRoster() {
      return rpc('sensei_trivia_roster');
    },
    async senseiTriviaPrize(coins) {
      return rpc('sensei_trivia_prize', { p_coins: coins });
    },
    async showcaseState() {
      return rpc('showcase_state');
    },
    async emoteSet(emote) {
      await rpc('emote_set', { p_emote: emote });
    },
    async showcaseSet(title, pose) {
      await rpc('showcase_set', { p_title: title, p_pose: pose });
    },
    async houseChallenge() {
      const d = await rpc('house_challenge');
      return { state: d.state, theme: d.theme, goal: d.goal, coins: d.coins, progress: d.progress === undefined ? undefined : Number(d.progress), reached: d.reached,
               myPoints: d.my_points, needMine: d.need_mine, claimed: d.claimed };
    },
    async raidState() {
      const d = await rpc('raid_state');
      return {
        boss: d.boss, maxHp: d.max_hp, damage: d.damage, defeated: d.defeated, strikers: d.strikers, struckToday: d.struck_today,
        power: d.power, myDamage: Number(d.my_damage), canClaim: d.can_claim, claimed: d.claimed, reward: d.reward,
      };
    },
    async raidStrike() {
      return rpc('raid_strike');
    },
    async raidClaim() {
      const d = await rpc('raid_claim');
      if (!d.ok) throw new Error(d.reason);
      return { awarded: d.awarded ?? 0, duplicate: !!d.duplicate };
    },
    async secretState() {
      const d = await rpc('secret_state');
      return {
        place: d.place, hint: d.hint, found: d.found, finders: Number(d.finders), won: d.won, winnerSquad: d.winner_squad,
        mySquadWon: d.my_squad_won, claimed: d.claimed, card: d.card,
      };
    },
    async secretFind() {
      const d = await rpc('secret_find');
      return { ok: !!d.ok, firstSquad: !!d.first_squad };
    },
    async secretClaim() {
      const d = await rpc('secret_claim');
      return { ok: !!d.ok };
    },
    async senseiSecret() {
      const d = await rpc('sensei_secret_view');
      return { place: d.place, hint: d.hint, card: d.card, finders: Number(d.finders), winnerSquad: d.winner_squad };
    },
    async senseiSecretSet(place, hint, card) {
      await rpc('sensei_secret_set', { p_place: place, p_hint: hint, p_card: card });
    },
    async stickerList() {
      const d = await rpc('sticker_list');
      return { stickers: d.stickers, madeToday: Number(d.made_today) };
    },
    async stickerMake(design) {
      const d = await rpc('sticker_make', { p_hero: design.hero, p_bg: design.bg, p_frame: design.frame, p_deco: design.deco, p_word: design.word });
      return { ok: !!d.ok, reason: d.reason };
    },
    async stickerGive(stickerId, toHero) {
      const d = await rpc('sticker_give', { p_sticker: stickerId, p_to: toHero });
      return { ok: !!d.ok, reason: d.reason };
    },
    async baseGet() {
      return (await rpc('base_get')) as never;
    },
    async basePlace(cell, item) {
      await rpc('base_place', { p_cell: cell, p_item: item });
    },
    async baseRemove(cell) {
      await rpc('base_remove', { p_cell: cell });
    },
    async treasureState() {
      return (await rpc('treasure_state')) as never;
    },
    async treasureFind(place) {
      const d = await rpc('treasure_find', { p_place: place });
      return { ok: !!d.ok, done: !!d.done };
    },
    async treasureClaim() {
      const d = await rpc('treasure_claim');
      return { ok: !!d.ok };
    },
    async badgeWall() {
      return (await rpc('badge_wall')) as string[];
    },
    async codeCreate(classId, coins, xp, announce = false) {
      return (await rpc('code_create', { p_class: classId, p_coins: coins, p_xp: xp, p_announce: announce })) as string;
    },
    async codeMine() {
      const d = await rpc('code_mine');
      return d.map((c: any) => ({ id: c.id, code: c.code, coins: c.coins, xp: c.xp, expiresAt: c.expires_at, className: c.class, redeemed: Number(c.redeemed) }));
    },
    async codeRedeem(code) {
      const d = await rpc('code_redeem', { p_code: code });
      return d.ok ? { ok: true, coins: d.coins, xp: d.xp } : { ok: false, reason: d.reason };
    },
    async contestState() {
      const d = await rpc('contest_state');
      return {
        theme: d.theme, entered: !!d.entered, hasRoom: !!d.has_room, voted: !!d.voted,
        entries: d.entries.map((e: any) => ({ hero: e.hero, name: e.name, starter: e.starter, layout: e.layout, mineVote: !!e.mine_vote })),
        last: { theme: d.last.theme, entered: !!d.last.entered, votes: Number(d.last.votes), won: !!d.last.won, claimed: !!d.last.claimed },
      };
    },
    async contestEnter() {
      await rpc('contest_enter');
    },
    async contestVote(heroId) {
      await rpc('contest_vote', { p_hero: heroId });
    },
    async contestClaim() {
      const d = await rpc('contest_claim');
      return { ok: !!d.ok };
    },
    async comicList() {
      return (await rpc('comic_list')) as never;
    },
    async comicSquad() {
      return (await rpc('comic_squad')) as never;
    },
    async comicMake(panels) {
      await rpc('comic_make', { p_panels: panels });
    },
    async comicShare(id, share) {
      await rpc('comic_share', { p_id: id, p_share: share });
    },
    async comicDelete(id) {
      await rpc('comic_delete', { p_id: id });
    },
    async houseChallengeClaim() {
      return rpc('house_challenge_claim');
    },
    async senseiChallenge() {
      const d = await rpc('sensei_challenge_view');
      return { theme: d.theme, goal: d.goal, coins: d.coins, houses: (d.houses ?? []).map((h: any) => ({ name: h.name, members: h.members, progress: Number(h.progress) })) };
    },
    async senseiSetChallenge(theme, goal, coins) {
      await rpc('sensei_set_challenge', { p_theme: theme, p_goal: goal, p_coins: coins });
    },
    async senseiEvents() {
      return rpc('sensei_events');
    },
    async senseiSetEvent(id, starts, ends, enabled) {
      await rpc('sensei_set_event', { p_id: id, p_starts: starts, p_ends: ends, p_enabled: enabled });
    },
    async questState() {
      const d = await rpc('quest_state');
      return { streak: d.streak, milestones: d.milestones, tasks: d.tasks, questCoins: d.quest_coins, questClaimed: d.quest_claimed };
    },
    async questClaim() {
      return rpc('quest_claim');
    },
    async streakClaim(days) {
      return rpc('streak_claim', { p_days: days });
    },
    async storyState() {
      return rpc('story_state');
    },
    async storySave(episode, panel) {
      await rpc('story_save', { p_episode: episode, p_panel: panel });
    },
    async storyChoose(episode, panelId, option) {
      return rpc('story_choose', { p_episode: episode, p_panel: panelId, p_option: option });
    },
    async storyAnswer(episode, checkpoint, choice) {
      const d = await rpc('story_answer', { p_episode: episode, p_checkpoint: checkpoint, p_choice: choice });
      return { correct: d.correct, rightChoice: d.right_choice, explanation: d.explanation, first: d.first };
    },
    async advState() {
      return rpc('adv_state');
    },
    async advAnswer(caseId, step, choice) {
      const d = await rpc('adv_answer', { p_case: caseId, p_step: step, p_choice: choice });
      return { correct: d.correct, rightChoice: d.right_choice, explanation: d.explanation, first: d.first };
    },
    async advComplete(caseId) {
      return rpc('adv_complete', { p_case: caseId });
    },
    async storyComplete(episode) {
      return rpc('story_complete', { p_episode: episode });
    },
    async senseiGiveCard(heroCode, cardId) {
      return rpc('sensei_give_card', { p_hero_code: heroCode, p_card: cardId });
    },
    async skillState() {
      const d = await rpc('skill_state');
      return { points: d.points, surge: surgeOf(d.surge), skills: d.skills };
    },
    async skillLearn(skillId) {
      const d = await rpc('skill_learn', { p_skill: skillId });
      return d.ok ? { ok: true } : { ok: false, reason: d.reason };
    },
    async nexlingState() {
      const d = await rpc('nexling_state');
      return { stages: d.stages, mine: d.mine && { type: d.mine.type, nickname: d.mine.nickname, color: d.mine.color, growth: d.mine.growth, stage: d.mine.stage, nextAt: d.mine.next_at } };
    },
    async nexlingAdopt(type, nickname, color) {
      await rpc('nexling_adopt', { p_type: type, p_nickname: nickname, p_color: color });
    },
    async shopState() {
      const d = await rpc('shop_state');
      return { coins: d.coins, xp: d.xp, equipped: d.equipped, events: d.events ?? [], items: d.items.map((i: any) => ({ ...i, unlockXp: i.unlock_xp })) };
    },
    async shopBuy(itemId) {
      const d = await rpc('shop_buy', { p_item: itemId });
      return d.ok ? { ok: true } : { ok: false, reason: d.reason };
    },
    async heroEquip(slot, itemId) {
      await rpc('hero_equip', { p_slot: slot, p_item: itemId });
    },
    async dormGet(friendHeroId) {
      return rpc('dorm_get', { p_friend: friendHeroId ?? null });
    },
    async dormSave(layout) {
      await rpc('dorm_save', { p_layout: layout });
    },
    async houseState() {
      const d = await rpc('house_state');
      return { state: d.state, weekPoints: d.week_points, cap: d.cap, house: d.house, className: d.class_name, members: d.members, options: d.options, myVote: d.my_vote };
    },
    async houseVote(optionId) {
      await rpc('house_vote', { p_option: optionId });
    },
    async leaderboard() {
      const d = await rpc('leaderboard');
      const rank = (x: any) => ({ ...x, rankWeek: x.rank_week, rankSeason: x.rank_season });
      return { minMembers: d.min_members, houses: d.houses.map(rank), heroes: d.heroes.map(rank) };
    },
    async houseTeacherView(classId) {
      return rpc('house_teacher_view', { p_class: classId });
    },
    async houseProposeOptions(classId, options) {
      await rpc('house_propose', { p_class: classId, p_options: options });
    },
    async houseCloseVote(classId) {
      await rpc('house_close_vote', { p_class: classId });
    },
    async currentRoom() {
      return (await rpc('my_room')) ?? null;
    },
    async createRoom(game) {
      return rpc('room_create', { p_game: game });
    },
    async joinRoom(code) {
      const d = await rpc('room_join', { p_code: code });
      if (!d) throw new Error('no room with that code');
      return d;
    },
    async leaveRoom() {
      await rpc('room_leave');
    },
    async startRoom() {
      await rpc('room_start');
    },
    async roomAnswer(choice) {
      await rpc('room_answer', { p_choice: choice });
    },
    async roomState(code) {
      const d = await rpc('room_state', { p_code: code });
      return {
        code: d.code, game: d.game, state: d.state, phase: d.phase, idx: d.idx, total: d.total, host: d.host, minPlayers: d.min_players,
        players: d.players, seconds: d.seconds, secondsLeft: d.seconds_left, question: d.question, myChoice: d.my_choice,
        rightChoice: d.right_choice, explanation: d.explanation, myPoints: d.my_points,
      };
    },
    async odinView(code) {
      const d = await rpc('odin_view', { p_code: code });
      return {
        state: d.state, color: d.color, dir: d.dir, top: d.top, deck: d.deck, myTurn: !!d.my_turn, secondsLeft: d.seconds_left ?? 0,
        hand: d.hand ?? [], winner: d.winner ?? null, players: d.players ?? [],
      };
    },
    async odinMove(card, color) {
      await rpc('odin_move', { p_card: card, p_color: color ?? null });
    },
    async shadowView(code) {
      const d = await rpc('shadow_view', { p_code: code });
      return {
        state: d.state, phase: d.phase, category: d.category, turn: d.turn, secondsLeft: d.seconds_left ?? 0, seconds: d.seconds ?? 0,
        isShadow: !!d.is_shadow, word: d.word ?? null, options: d.options ?? null, myVote: d.my_vote ?? null,
        players: d.players ?? [],
        result: d.result ? { caught: !!d.result.caught, shadowWon: !!d.result.shadow_won, guess: d.result.guess ?? null, word: d.result.word } : null,
      };
    },
    async shadowClue(text) {
      await rpc('shadow_clue', { p_text: text });
    },
    async shadowVote(index) {
      await rpc('shadow_vote', { p_index: index });
    },
    async shadowGuess(word) {
      await rpc('shadow_guess', { p_word: word });
    },
    async drawingView(code, since) {
      const d = await rpc('drawing_view', { p_code: code, p_since: since });
      return {
        state: d.state, phase: d.phase, round: d.round, rounds: d.rounds, seconds: d.seconds, secondsLeft: d.seconds_left ?? 0,
        isArtist: !!d.is_artist, solved: !!d.solved, voided: !!d.voided, artist: d.artist, word: d.word ?? null, pattern: d.pattern ?? null,
        strokesFrom: d.strokes_from ?? 0, strokes: d.strokes ?? [], guesses: d.guesses ?? [], players: d.players ?? [],
      };
    },
    async drawingStroke(id, color, width, points) {
      await rpc('drawing_stroke', { p_id: id, p_color: color, p_width: width, p_points: points });
    },
    async drawingClear() {
      await rpc('drawing_clear');
    },
    async drawingGuess(text) {
      return rpc('drawing_guess', { p_text: text });
    },
    async drawingReport() {
      await rpc('drawing_report');
    },
    async senseiDrawingReports() {
      return rpc('sensei_drawing_reports');
    },
    async nexusView(code) {
      const d = await rpc('nexus_view', { p_code: code });
      return {
        state: d.state, outcome: d.outcome, secondsLeft: d.seconds_left ?? 0, secondsTotal: d.seconds_total ?? 0, penalty: d.penalty ?? 0,
        solved: d.solved ?? 0, need: d.need ?? 3, wrong: d.wrong ?? 0,
        question: d.question ? { prompt: d.question.prompt, choices: d.question.choices, hidden: d.question.hidden ?? [] } : null,
        canBoost: !!d.can_boost, players: d.players ?? [],
      };
    },
    async nexusAnswer(choice) {
      const d = await rpc('nexus_answer', { p_choice: choice });
      return { correct: !!d.correct, rightChoice: Number(d.right_choice ?? -1), explanation: d.explanation ?? '', penalty: d.penalty ?? 0, over: !!d.over };
    },
    async nexusBoost(index) {
      await rpc('nexus_boost', { p_index: index });
    },
    async chatSend(text) {
      const d = await rpc('chat_send', { p_text: text });
      if (d.ok) return { ok: true };
      return { ok: false, reason: d.banned ? 'banned' : d.warning ? 'warning' : d.private ? 'private' : d.no_class ? 'no_class' : 'slow' };
    },
    async chatRead() {
      const d = await rpc('chat_read');
      return { banned: d.banned, canChat: d.can_chat !== false, messages: d.messages };
    },
    async childChat(childId) {
      return rpc('child_chat', { p_child: childId });
    },
    async chatRequestUnlock(childId) {
      await rpc('chat_request_unlock', { p_child: childId });
    },
    async senseiChatRequests() {
      return ((await rpc('sensei_chat_requests')) as any[]).map((r) => ({ childId: r.child_id, name: r.name, grade: r.grade, requested: r.requested }));
    },
    async senseiChatLog(childId) {
      return ((await rpc('sensei_chat_log', { p_child: childId })) as any[]).map((l) => ({ name: l.name, child: l.child, body: l.body, at: l.at }));
    },
    async chatUnlock(childId) {
      await rpc('chat_unlock', { p_child: childId });
    },
    async senseiOverview() {
      const d = await rpc('sensei_overview');
      return {
        heroes: d.heroes, grade5: d.grade5, grade6: d.grade6, parents: d.parents, teachers: d.teachers,
        pendingTeachers: d.pending_teachers, classes: d.classes, triviaNight: d.trivia_night,
      };
    },
    async ping(screen) {
      await rpc('ping', { p_screen: screen });
    },
    async senseiTraffic() {
      const d = await rpc('sensei_traffic');
      return {
        totalHeroes: d.total_heroes, nowHeroes: d.now_heroes, nowAdults: d.now_adults, todayHeroes: d.today_heroes,
        weekHeroes: d.week_heroes, monthHeroes: d.month_heroes,
        active: d.active.map((a: any) => ({ name: a.name, grade: a.grade, screen: a.screen, secondsAgo: a.seconds_ago })),
        days: d.days.map((x: any) => ({ day: x.day, heroes: x.heroes, adults: x.adults, minutes: x.minutes, newHeroes: x.new_heroes })),
        hours: d.hours, screens: d.screens,
      };
    },
    async pendingTeachers() {
      return ((await rpc('list_pending_teachers')) as any[]).map((t) => ({ id: t.id, displayName: t.display_name, email: t.email }));
    },
    async approveTeacher(id, approve) {
      await rpc('approve_teacher', { p_id: id, p_approve: approve });
    },
    async postAnnouncement(title, body) {
      await rpc('post_announcement', { p_title: title, p_body: body });
    },
    async setTriviaNight(weekday, time) {
      await rpc('sensei_set_setting', { p_key: 'trivia_night', p_value: { weekday, time } });
    },
  };
}
