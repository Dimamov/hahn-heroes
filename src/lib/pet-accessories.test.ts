import { describe, expect, it } from 'vitest';
import { PET_ACCESSORIES, accessoryIcon, toggleAccessory } from './pet-accessories.ts';

describe('pet accessories', () => {
  const crown = PET_ACCESSORIES.find((a) => a.id === 'crown')!;
  const cap = PET_ACCESSORIES.find((a) => a.id === 'cap')!;
  it('a new accessory replaces the old one in the same slot', () => {
    const o = toggleAccessory(toggleAccessory({}, crown), cap);
    expect(o).toEqual({ head: 'cap' });
    expect(accessoryIcon(o, 'head')).toBe('🧢');
  });
  it('choosing the worn one takes it off', () => {
    expect(toggleAccessory({ head: 'crown' }, crown)).toEqual({});
  });
});
