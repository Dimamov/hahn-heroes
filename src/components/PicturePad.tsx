import { PICTURES } from '../lib/heroes.ts';
import { PICTURE_LENGTH } from '../../supabase/functions/_shared/kid-auth.ts';

/** 3x3 grid of pictures; tap three different ones, in order. Tap a chosen one to undo it. */
export function PicturePad({ value, onChange }: { value: number[]; onChange: (v: number[]) => void }) {
  const tap = (i: number) => {
    if (value.includes(i)) onChange(value.filter((v) => v !== i));
    else if (value.length < PICTURE_LENGTH) onChange([...value, i]);
  };
  return (
    <div className="picture-pad">
      <div className="picked" aria-live="polite">
        {Array.from({ length: PICTURE_LENGTH }, (_, slot) => (
          <span key={slot} className={`slot${value[slot] !== undefined ? ' full' : ''}`}>{value[slot] !== undefined ? '●' : ''}</span>
        ))}
      </div>
      <div className="picture-grid">
        {PICTURES.map((p, i) => (
          <button key={i} className={`pic${value.includes(i) ? ' chosen' : ''}`} onClick={() => tap(i)} aria-label={`Picture ${i + 1}`} aria-pressed={value.includes(i)}>
            <span aria-hidden>{p}</span>
            {value.includes(i) && <b>{value.indexOf(i) + 1}</b>}
          </button>
        ))}
      </div>
    </div>
  );
}
