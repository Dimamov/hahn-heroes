import type { ReactNode } from 'react';
import { Pager } from './Pager.tsx';

const chunk = <T,>(list: T[], n: number): T[][] => Array.from({ length: Math.max(1, Math.ceil(list.length / n)) }, (_, i) => list.slice(i * n, i * n + n));

/** Items in fitted pages of a 3 x 2 grid. Swipe for more. */
export function ItemGrid<T>({ items, render, empty, perPage = 6 }: { items: T[]; render: (item: T) => ReactNode; empty: string; perPage?: number }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return (
    <div className="paged">
      <Pager pages={chunk(items, perPage).map((page, i) => <div className="item-grid" key={i}>{page.map(render)}</div>)} />
    </div>
  );
}
