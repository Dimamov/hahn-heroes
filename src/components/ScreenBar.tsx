export function ScreenBar({ title, onBack, right }: { title: string; onBack: () => void; right?: React.ReactNode }) {
  return (
    <header className="bar">
      <button className="back" onClick={onBack} aria-label="Back">←</button>
      <h2>{title}</h2>
      {right && <div className="bar-right">{right}</div>}
    </header>
  );
}
