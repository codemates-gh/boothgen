import { describe, it, expect } from 'vitest';
import { clientDisplayName } from '@/lib/clientName';

// Report #4: corporate clients show the company, care of the person who booked
describe('clientDisplayName', () => {
  it('shows "Company c/o Contact" for a corporate client with a company', () => {
    expect(clientDisplayName({ firstName: 'Joy Danelle', lastName: 'Talaga', company: 'Kawneer Company Canada Ltd', isCorporate: true }))
      .toBe('Kawneer Company Canada Ltd c/o Joy Danelle Talaga');
  });
  it('keeps the person\'s name when the client is not marked corporate', () => {
    expect(clientDisplayName({ firstName: 'Joy', lastName: 'Talaga', company: 'Kawneer', isCorporate: false })).toBe('Joy Talaga');
  });
  it('keeps the person\'s name when a corporate client has no company', () => {
    expect(clientDisplayName({ firstName: 'Joy', lastName: 'Talaga', company: '  ', isCorporate: true })).toBe('Joy Talaga');
  });
  it('shows just the company when there is no contact name', () => {
    expect(clientDisplayName({ firstName: '', lastName: null, company: 'Kawneer', isCorporate: true })).toBe('Kawneer');
  });
  it('is empty for no client', () => {
    expect(clientDisplayName(null)).toBe('');
  });
});
