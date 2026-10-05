import { useEffect, useState } from 'react';
import type { Backend } from '../../lib/backend.ts';
import { ScreenBar } from '../../components/ScreenBar.tsx';
import { PagedList } from '../../components/PagedList.tsx';
import { kindReason, KIND_REWARD, KIND_WEEKLY_MAX, type KindRow } from '../../lib/kindness.ts';

/** Kindness nominations waiting for a yes. Approving pays the nominee; "thanks back and forth" is flagged. */
export function KindReview({ backend, onBack }: { backend: Backend; onBack: () => void }) {
  const [rows, setRows] = useState<KindRow[] | null>(null);
  const load = () => backend.kindReview().then(setRows).catch(() => setRows([]));
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const decide = async (r: KindRow, ok: boolean) => { await backend.kindDecide(r.id, ok).catch(() => {}); load(); };
  return (
    <main className="screen">
      <ScreenBar title="Kindness" onBack={onBack} />
      <p className="hint">Approve to give {KIND_REWARD} 💎 (up to {KIND_WEEKLY_MAX} a week each).</p>
      {rows === null ? <div className="spinner" /> : (
        <PagedList items={rows} perPage={4} empty="Nothing waiting." render={(r) => (
          <div key={r.id} className="card report-row">
            <b>{r.nominator} thanked {r.nominee}</b>
            <small>{kindReason(r.reason)?.icon} {kindReason(r.reason)?.label}{r.repeat ? ' · ⚠ thanked back this week' : ''}</small>
            <div className="btn-grid"><button className="btn primary" onClick={() => decide(r, true)}>Approve</button><button className="btn ghost" onClick={() => decide(r, false)}>Skip</button></div>
          </div>
        )} />
      )}
    </main>
  );
}
