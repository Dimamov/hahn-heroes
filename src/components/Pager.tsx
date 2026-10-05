import { useEffect, useRef, useState, type ReactNode } from 'react';

/** Swipeable pages (native scroll snap) with dots. Each page fits the screen; no arrows. */
export function Pager({ pages, badges = [], onPage }: { pages: ReactNode[]; badges?: boolean[]; onPage?: (i: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const onScroll = () => {
      const i = Math.round(el.scrollLeft / el.clientWidth);
      setIndex((prev) => {
        if (prev !== i) onPage?.(i);
        return i;
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [onPage]);

  const goTo = (i: number) => ref.current?.scrollTo({ left: i * ref.current.clientWidth, behavior: 'smooth' });

  return (
    <div className="pager">
      <div className="pager-track" ref={ref}>
        {pages.map((page, i) => (
          <section className="pager-page" key={i} aria-label={`Page ${i + 1} of ${pages.length}`}>
            {page}
          </section>
        ))}
      </div>
      {pages.length > 1 && (
        <div className="dots" role="tablist">
          {pages.map((_, i) => (
            <button
              key={i}
              role="tab"
              aria-selected={i === index}
              aria-label={`Go to page ${i + 1}`}
              className={`dot${i === index ? ' on' : ''}${badges[i] ? ' badge' : ''}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
