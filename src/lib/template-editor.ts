// Small rules shared by the email / contract template editors (report #11)

// The visual editor is a contentEditable box that React mounts empty. It has to be refilled from the
// saved HTML whenever it comes back on screen: switching from HTML mode, or returning from Preview.
export function editorNeedsRefill(opts: { mode: 'visual' | 'html'; showPreview: boolean; currentHtml: string | undefined; value: string }): boolean {
  return opts.mode === 'visual' && !opts.showPreview && opts.currentHtml !== undefined && opts.currentHtml !== opts.value;
}

// Updating an existing template keeps its editor open, so the user stays where they were working.
// Creating a new one closes the editor (the list shows the new template).
export function closeEditorAfterSave(isUpdate: boolean): boolean {
  return !isUpdate;
}
