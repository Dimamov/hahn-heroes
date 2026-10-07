import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { EPISODES, storyPage, storyPose } from './story.ts';

const onDisk = (url: string) => existsSync(join(process.cwd(), 'public', url));

describe('story content', () => {
  it('Episode 1 is full-screen shots with no quiz or choice panels', () => {
    const ep = EPISODES.find((e) => e.id === 'ep1')!;
    expect(ep.panels).toHaveLength(22);
    expect(ep.panels.some((p) => p.kind === 'quiz' || p.kind === 'choice')).toBe(false);
    expect(ep.panels[0].kind).toBe('title');
    expect(ep.panels.at(-1)?.kind).toBe('end');
  });
  it('every picture and pose a panel names exists', () => {
    for (const ep of EPISODES) {
      if (ep.cover) expect(onDisk(storyPage(ep.cover)), ep.cover).toBe(true);
      for (const p of ep.panels) {
        if ('page' in p && p.page) expect(onDisk(storyPage(p.page)), p.page).toBe(true);
        if ('pose' in p && p.pose) expect(onDisk(storyPose(p.pose)), p.pose).toBe(true);
      }
    }
  });
});
