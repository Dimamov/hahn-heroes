import type { ReactNode } from 'react';
import { Pager } from './Pager.tsx';

const chunk = <T,>(list: T[], n: number): T[][] => Array.from({ length: Math.ceil(list.length / n) }, (_, i) => list.slice(i * n, i * n + n));

/** A list that never scrolls: items are split into swipeable pages that fit the screen. */
export function PagedList<T>({ items, perPage, render, empty }: { items: T[]; perPage: number; render: (item: T) => ReactNode; empty: string }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return (
    <div className="paged">
      <Pager pages={chunk(items, perPage).map((page, i) => <div className="list-page" key={i}>{page.map(render)}</div>)} />
    </div>
  );
}
