// Achievement wall: fun, silly badges. The server says which ids a hero has earned.
export interface Badge { id: string; name: string; icon: string; how: string }
export const BADGES: Badge[] = [
  { id: 'first-steps', name: 'First Steps', icon: '👣', how: 'Answer your first Learn question.' },
  { id: 'brainiac', name: 'Brainiac', icon: '🧠', how: 'Get 50 questions right.' },
  { id: 'streak-master', name: 'Streak Master', icon: '🔥', how: 'Collect your daily reward on 7 different days.' },
  { id: 'night-owl', name: 'Night Owl', icon: '🦉', how: 'Answer a question after 8 at night.' },
  { id: 'early-bird', name: 'Early Bird', icon: '🐤', how: 'Answer a question before 7 in the morning.' },
  { id: 'squad-up', name: 'Squad Up', icon: '🤝', how: 'Join a squad.' },
  { id: 'friendly', name: 'Friendly Hero', icon: '😄', how: 'Make 3 friends.' },
  { id: 'collector', name: 'Card Collector', icon: '🃏', how: 'Collect 10 different cards.' },
  { id: 'fashionista', name: 'Fashionista', icon: '🕶️', how: 'Own 3 shop items.' },
  { id: 'pet-parent', name: 'Pet Parent', icon: '🐾', how: 'Adopt a Nexling.' },
  { id: 'story-finisher', name: 'Story Finisher', icon: '📖', how: 'Finish a story episode.' },
  { id: 'boss-buster', name: 'Boss Buster', icon: '🐲', how: 'Strike the school boss.' },
  { id: 'sparkle-spotter', name: 'Sparkle Spotter', icon: '✨', how: 'Find the weekly secret.' },
  { id: 'comic-creator', name: 'Comic Creator', icon: '💬', how: 'Make a comic.' },
  { id: 'sticker-star', name: 'Sticker Star', icon: '🏷️', how: 'Make a sticker.' },
  { id: 'code-cracker', name: 'Code Cracker', icon: '🔑', how: 'Use a secret code.' },
  { id: 'room-showoff', name: 'Room Show-off', icon: '🏆', how: 'Enter the room contest.' },
  { id: 'big-spender', name: 'Big Spender', icon: '🛍️', how: 'Buy something in the shop.' },
];
