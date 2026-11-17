// One column layout for the Quotes, Contracts and Invoices boxes on the event page, so Status and the arrow line up
// across all three: name | amount | date or balance | status | arrow. On phones the amount and date columns hide
// (DOC_WIDE) and show as a second line under the name instead (DOC_NARROW), so nothing scrolls sideways.
export const DOC_GRID = 'grid grid-cols-[minmax(0,1fr)_auto_1rem] sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_1rem] items-center gap-3 px-4';
export const DOC_HEAD = DOC_GRID + ' py-2 text-[11px] font-medium uppercase tracking-wide text-gray-400 border-b border-gray-100';
// A whole row is one link to the document
export const DOC_ROW = DOC_GRID + ' py-3 text-sm hover:bg-gray-50 transition-colors group';
export const DOC_WIDE = 'hidden sm:block';
export const DOC_NARROW = 'sm:hidden block text-xs font-normal text-gray-500 truncate';
