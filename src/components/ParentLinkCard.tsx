import { useEffect, useState } from 'react';
import { useSession } from '../App.tsx';

/** A clear spot for a kid to link a parent. Big and friendly until a parent is linked, then a quiet line. */
export function ParentLinkCard({ compact = false }: { compact?: boolean }) {
  const { backend, go } = useSession();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => { backend.parentCount().then(setCount).catch(() => setCount(null)); }, [backend]);
  if (count === null) return null;
  if (count > 0) {
    return <button className="btn link" onClick={() => go('parentcode')}>👪 Parent linked ✓ · add another grown-up</button>;
  }
  return (
    <button className={`parent-card${compact ? ' compact' : ''}`} onClick={() => go('parentcode')}>
      <span className="parent-card-icon" aria-hidden>👪</span>
      <span>
        <b>Link your parent</b>
        {!compact && <small>With a parent account they can see how your week is going, give you home chores and approve them, and get your weekly summary. Tap to get your code.</small>}
        {compact && <small>See your week, approve chores. Tap for a code.</small>}
      </span>
    </button>
  );
}
