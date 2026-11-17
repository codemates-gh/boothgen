// One column layout for the Quotes, Contracts and Invoices boxes on the event page, so Status and the action line up
// across all three: name | amount | date or balance | status | action
export const DOC_GRID = 'grid grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1.3fr)_minmax(0,1.1fr)_7rem] items-center gap-3 px-4';
export const DOC_HEAD = DOC_GRID + ' py-2 text-[11px] font-medium uppercase tracking-wide text-gray-400 border-b border-gray-100';
export const DOC_ROW = DOC_GRID + ' py-3 text-sm hover:bg-gray-50';
