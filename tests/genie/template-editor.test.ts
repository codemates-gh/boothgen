import { describe, it, expect } from 'vitest';
import { editorNeedsRefill, closeEditorAfterSave } from '@/lib/template-editor';

describe('template editor (report #11)', () => {
  it('refills the visual editor when returning from Preview', () => {
    // Preview unmounts the editor box; it comes back empty
    expect(editorNeedsRefill({ mode: 'visual', showPreview: false, currentHtml: '', value: '<p>Terms</p>' })).toBe(true);
  });
  it('does not touch the editor while Preview or HTML mode is showing', () => {
    expect(editorNeedsRefill({ mode: 'visual', showPreview: true, currentHtml: undefined, value: '<p>Terms</p>' })).toBe(false);
    expect(editorNeedsRefill({ mode: 'html', showPreview: false, currentHtml: undefined, value: '<p>Terms</p>' })).toBe(false);
  });
  it('leaves the editor alone when it already shows the text (no cursor jump while typing)', () => {
    expect(editorNeedsRefill({ mode: 'visual', showPreview: false, currentHtml: '<p>Terms</p>', value: '<p>Terms</p>' })).toBe(false);
  });
  it('keeps the editor open after Update, closes it after creating', () => {
    expect(closeEditorAfterSave(true)).toBe(false);
    expect(closeEditorAfterSave(false)).toBe(true);
  });
});
