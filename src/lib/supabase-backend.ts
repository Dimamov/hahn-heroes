import { createClient } from '@supabase/supabase-js';
import {
  AdultAuthError, SignInError, emptyBalances,
  type Adult, type Backend, type ClassMission, type ClassResult, type Hero, type HomeMission, type Identity,
  type NewClassMission, type QuizQuestion, type SignUpInput, type SubjectProgress,
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

  async function loadHero(): Promise<Hero | null> {
    const { data: { session } } = await sb.auth.getSession();
    if (!session) return null;
    const { data, error } = await sb.from('heroes').select('*').eq('id', session.user.id).maybeSingle();
    if (error || !data) return null;
    return { id: data.id, heroCode: data.hero_code, displayName: data.display_name, grade: data.grade, starter: data.starter_hero };
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
    async senseiOverview() {
      const d = await rpc('sensei_overview');
      return {
        heroes: d.heroes, grade5: d.grade5, grade6: d.grade6, parents: d.parents, teachers: d.teachers,
        pendingTeachers: d.pending_teachers, classes: d.classes, triviaNight: d.trivia_night,
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
