import { describe, it, expect } from 'vitest';
import { splitLineItemDescription } from '@/lib/lineItems';

describe('splitLineItemDescription', () => {
  it('splits a package description typed on separate "*" lines into bullets (report #5)', () => {
    const d = '2 Hours Photo Booth Service (WACKY) — *Creative print layout design (2-4 photos)\n*Delivery & setup within Lethbridge city limits\n*Use of 1 standard backdrop';
    expect(splitLineItemDescription(d)).toEqual({
      title: '2 Hours Photo Booth Service (WACKY)',
      bullets: ['Creative print layout design (2-4 photos)', 'Delivery & setup within Lethbridge city limits', 'Use of 1 standard backdrop'],
    });
  });
  it('splits "*" items typed on one line', () => {
    expect(splitLineItemDescription('Booth — *Prints *On-site operators *Props').bullets).toEqual(['Prints', 'On-site operators', 'Props']);
  });
  it('keeps the existing dash behaviour', () => {
    expect(splitLineItemDescription('Package — 3 hours — Unlimited prints')).toEqual({ title: 'Package', bullets: ['3 hours', 'Unlimited prints'] });
  });
  it('handles "- " bullets on new lines and plain line breaks', () => {
    expect(splitLineItemDescription('Package\n- Prints\n- Props')).toEqual({ title: 'Package', bullets: ['Prints', 'Props'] });
    expect(splitLineItemDescription('Package\nPrints\nProps')).toEqual({ title: 'Package', bullets: ['Prints', 'Props'] });
  });
  it('leaves a plain name alone, and keeps hyphens inside words', () => {
    expect(splitLineItemDescription('Extra hour')).toEqual({ title: 'Extra hour', bullets: [] });
    expect(splitLineItemDescription('Glam booth — 2-4 photos')).toEqual({ title: 'Glam booth', bullets: ['2-4 photos'] });
    expect(splitLineItemDescription(null)).toEqual({ title: '', bullets: [] });
  });
});
