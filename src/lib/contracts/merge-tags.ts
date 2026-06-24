
export type MergeCtx = {
  client: { first_name: string; last_name: string; full_name: string; email: string; phone?: string; company?: string };
  event: { title: string; date: string; time?: string; start_time?: string; end_time?: string; venue_name?: string; venue_address?: string; venue_city?: string; venue_state?: string; venue_zip?: string; package_name?: string; guest_count?: string };
  invoice: { number?: string; total?: string; balance_due?: string; retainer_amount?: string; due_date?: string; payment_link?: string };
  contract: { link?: string; expiry?: string; title?: string };
  quote: { link?: string; number?: string; total?: string };
  host: { company_name: string; email?: string; phone?: string; website?: string; signature?: string };
  portal: { link: string };
};
/** Strip editor merge-tag span wrappers, keeping only the inner text or resolved tag value. */
export function stripMergeTagSpans(html: string): string {
  // Remove spans that have a data-tag attribute (editor-inserted, may still have {{...}} or real value)
  let out = html.replace(/<span\b[^>]*\bdata-tag="[^"]*"[^>]*>([\s\S]*?)<\/span>/g, '$1');
  // Remove any remaining spans with class="merge-tag" (belt-and-suspenders)
  out = out.replace(/<span\b[^>]*\bclass="[^"]*\bmerge-tag\b[^"]*"[^>]*>([\s\S]*?)<\/span>/g, '$1');
  return out;
}

export function parseMergeTags(tpl: string, ctx: MergeCtx, showMissing = false): string {
  // Strip visual-editor span wrappers so only the raw {{tag}} remains, then substitute
  const cleaned = stripMergeTagSpans(tpl);
  return cleaned.replace(/{{([^}]+)}}/g, (match, raw: string) => {
    const keys = raw.trim().split('.');
    let v: any = ctx;
    for (const k of keys) { if (v == null) return showMissing ? match : ''; v = v[k as keyof typeof v]; }
    return v != null ? String(v) : (showMissing ? match : '');
  });
}
export function buildCtx(params: {
  client: { firstName: string; lastName: string; email: string; phone?: string | null; company?: string | null };
  event: { title: string; eventDate: Date; startTime?: Date | null; endTime?: Date | null; venueName?: string | null; venueAddress?: string | null; venueCity?: string | null; venueState?: string | null; venuePostalCode?: string | null; packageName?: string | null; guestCount?: number | null; portalToken?: string | null };
  invoice?: { invoiceNumber: string; totalCents: number; balanceDueCents: number; retainerAmountCents?: number | null; dueDate?: Date | null; currency?: string } | null;
  contract?: { clientToken: string; title: string; expiresAt?: Date | null } | null;
  quote?: { quoteNumber: string; totalCents: number; currency?: string } | null;
  branding: { companyName?: string | null; replyToEmail?: string | null; supportPhone?: string | null; websiteUrl?: string | null; emailHeaderHtml?: string | null };
  appUrl: string;
}): MergeCtx {
  const { format } = require('date-fns');
  const { client, event, invoice, contract, quote, branding, appUrl } = params;
  const fmt = (cents: number, cur = 'usd') => new Intl.NumberFormat('en-US', { style: 'currency', currency: cur.toUpperCase() }).format(cents / 100);
  return {
    client: { first_name: client.firstName, last_name: client.lastName, full_name: client.firstName + ' ' + client.lastName, email: client.email, phone: client.phone ?? undefined, company: client.company ?? undefined },
    event: { title: event.title, date: format(event.eventDate, 'EEEE, MMMM d, yyyy'), time: event.startTime ? format(event.startTime, 'h:mm a') + (event.endTime ? ' – ' + format(event.endTime, 'h:mm a') : '') : undefined, start_time: event.startTime ? format(event.startTime, 'h:mm a') : undefined, end_time: event.endTime ? format(event.endTime, 'h:mm a') : undefined, venue_name: event.venueName ?? undefined, venue_address: [event.venueAddress, event.venueCity, event.venueState].filter(Boolean).join(', ') || undefined, venue_city: event.venueCity ?? undefined, venue_state: event.venueState ?? undefined, venue_zip: event.venuePostalCode ?? undefined, package_name: event.packageName ?? undefined, guest_count: event.guestCount?.toString() },
    invoice: invoice ? { number: invoice.invoiceNumber, total: fmt(invoice.totalCents, invoice.currency), balance_due: fmt(invoice.balanceDueCents, invoice.currency), retainer_amount: invoice.retainerAmountCents ? fmt(invoice.retainerAmountCents, invoice.currency) : undefined, due_date: invoice.dueDate ? format(invoice.dueDate, 'MMMM d, yyyy') : undefined, payment_link: appUrl + '/portal/' + (event.portalToken ?? '') } : {},
    contract: contract ? { link: appUrl + '/portal/' + contract.clientToken, expiry: contract.expiresAt ? format(contract.expiresAt, 'MMMM d, yyyy') : undefined, title: contract.title } : {},
    quote: quote ? { link: appUrl + '/portal/' + (event.portalToken ?? '') + '?tab=quote', number: quote.quoteNumber, total: fmt(quote.totalCents, quote.currency) } : {},
    host: { company_name: branding.companyName ?? 'Your Company', email: branding.replyToEmail ?? undefined, phone: branding.supportPhone ?? undefined, website: branding.websiteUrl ?? undefined, signature: branding.emailHeaderHtml ? branding.emailHeaderHtml.replace(/\n/g, '<br>') : undefined },
    portal: { link: appUrl + '/portal/' + (event.portalToken ?? '') },
  };
}
