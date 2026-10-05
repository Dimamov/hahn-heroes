// Kindness points: preset reasons only (no typing). The ids match kind_reasons() in the database.
export const KIND_REASONS = [
  { id: 'hard-question', label: 'Helped with a hard question', icon: '🧠' },
  { id: 'great-idea', label: 'Shared a great idea', icon: '💡' },
  { id: 'cheered', label: 'Cheered me on', icon: '📣' },
  { id: 'teamwork', label: 'Great teamwork', icon: '🤝' },
  { id: 'included', label: 'Included someone', icon: '🫶' },
  { id: 'kind-words', label: 'Used kind words', icon: '💬' },
  { id: 'taught', label: 'Taught me something', icon: '📚' },
  { id: 'positive', label: 'Stayed positive', icon: '🌈' },
] as const;
export const kindReason = (id: string) => KIND_REASONS.find((r) => r.id === id);
export const KIND_REWARD = 5;
export const KIND_WEEKLY_MAX = 3;

export interface KindState { nominatedToday: boolean; mates: { id: string; name: string }[]; received: { reason: string; day: string }[] }
export interface KindRow { id: number; nominator: string; nominee: string; reason: string; day: string; repeat: boolean }
