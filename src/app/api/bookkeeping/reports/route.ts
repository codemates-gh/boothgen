export const dynamic = 'force-dynamic';
// Bookkeeping reports for a date range:
//   ?report=pl       Profit & Loss: income and expenses by category, month by month, and net
//   ?report=clients  Client Sales: income per client
//   ?report=transactions&format=csv  the filtered transaction list (same filters as the Bookkeeping page);
//        &layout=quickbooks or &layout=xero for those programs' bank-statement import formats
//   ?report=year&year=2026   Year-End Summary (totals, quarters, categories, top clients, what's left to tidy up)
// Add &format=csv to download any of them.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { bookkeeper } from '@/lib/bookkeeping/auth';
import { ledgerWhere, filtersFrom } from '@/lib/bookkeeping/query';
import { clientDisplayName } from '@/lib/clientName';
import { MILEAGE_DISCLAIMER, TAX_DISCLAIMER } from '@/lib/bookkeeping/disclaimer';

const csvCell = (v: unknown) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
const csv = (rows: unknown[][]) => rows.map(r => r.map(csvCell).join(',')).join('\n') + '\n';
const money = (c: number) => (c / 100).toFixed(2);
const day = (d: Date) => d.toISOString().slice(0, 10);
const monthKey = (d: Date) => d.toISOString().slice(0, 7);

function download(name: string, body: string) {
  return new NextResponse(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}"` } });
}

export async function GET(req: NextRequest) {
  const who = await bookkeeper();
  if (who instanceof NextResponse) return who;
  const sp = req.nextUrl.searchParams;
  const report = sp.get('report') ?? 'pl';
  const asCsv = sp.get('format') === 'csv';
  const f = filtersFrom(sp);
  const range = `${f.from || 'start'}_to_${f.to || 'today'}`;

  if (report === 'transactions') {
    const layout = sp.get('layout');
    if (layout === 'quickbooks' || layout === 'xero') {
      const branding = await prisma.tenantBranding.findUnique({ where: { tenantId: who.tenantId }, select: { country: true } });
      const us = !branding?.country || ['US', 'USA', 'United States'].includes(branding.country);
      const rows = await prisma.ledgerTransaction.findMany({
        where: ledgerWhere(who.tenantId, f), orderBy: { date: 'asc' },
        include: { category: { select: { name: true } }, invoice: { select: { invoiceNumber: true } } },
      });
      const d = (x: Date) => { const [y, m, dd] = day(x).split('-'); return us ? `${m}/${dd}/${y}` : `${dd}/${m}/${y}`; };
      const signed = (r: { type: string; amountCents: number }) => money(r.type === 'EXPENSE' ? -r.amountCents : r.amountCents);
      if (layout === 'quickbooks') {
        // QuickBooks Online → Banking → Upload transactions (3-column: Date, Description, Amount)
        return download(`quickbooks-${range}.csv`, csv([
          ['Date', 'Description', 'Amount'],
          ...rows.map(r => [d(r.date), [r.payee, r.description, r.category?.name].filter(Boolean).join(' - '), signed(r)]),
        ]));
      }
      // Xero → Bank account → Import a statement (CSV)
      return download(`xero-${range}.csv`, csv([
        ['*Date', '*Amount', 'Payee', 'Description', 'Reference'],
        ...rows.map(r => [d(r.date), signed(r), r.payee, r.description, [r.category?.name, r.invoice?.invoiceNumber].filter(Boolean).join(' / ')]),
      ]));
    }
    const rows = await prisma.ledgerTransaction.findMany({
      where: ledgerWhere(who.tenantId, f), orderBy: { date: 'asc' },
      include: { category: { select: { name: true } }, event: { select: { title: true } }, invoice: { select: { invoiceNumber: true } } },
    });
    return download(`bookkeeping-transactions-${range}.csv`, csv([
      ['Date', 'Type', 'Description', 'Payee', 'Category', 'Amount', 'Event', 'Invoice', 'Verified', 'Receipt', 'Notes'],
      ...rows.map(r => [day(r.date), r.type === 'INCOME' ? 'Income' : 'Expense', r.description, r.payee, r.category?.name ?? 'Uncategorized',
        (r.type === 'EXPENSE' ? '-' : '') + money(r.amountCents), r.event?.title, r.invoice?.invoiceNumber, r.verified ? 'Yes' : 'No', r.receiptUrl, r.notes]),
    ]));
  }

  if (report === 'year') {
    const year = parseInt(sp.get('year') ?? '', 10) || new Date().getFullYear();
    const yw = ledgerWhere(who.tenantId, { from: `${year}-01-01`, to: `${year}-12-31` });
    const rows = await prisma.ledgerTransaction.findMany({
      where: yw,
      select: { type: true, amountCents: true, date: true, eventId: true, clientId: true, payee: true, verified: true, receiptUrl: true, source: true, categoryId: true,
        category: { select: { name: true } }, client: { select: { firstName: true, lastName: true, company: true } } },
    });
    const isRefund = (r: typeof rows[number]) => r.type === 'INCOME' && r.amountCents < 0;
    const sum = (l: typeof rows) => l.reduce((n, r) => n + r.amountCents, 0);
    const income = rows.filter(r => r.type === 'INCOME');
    const expense = rows.filter(r => r.type === 'EXPENSE');
    const grossIncome = sum(income.filter(r => !isRefund(r)));
    const refunds = -sum(income.filter(isRefund));
    const totalIncome = sum(income);
    const totalExpense = sum(expense);
    const quarters = [1, 2, 3, 4].map(q => {
      const inQ = (r: typeof rows[number]) => Math.floor(r.date.getUTCMonth() / 3) + 1 === q;
      const i = sum(income.filter(inQ)); const e = sum(expense.filter(inQ));
      return { quarter: q, income: i, expense: e, net: i - e };
    });
    const byCat = (l: typeof rows) => {
      const m = new Map<string, number>();
      for (const r of l) m.set(r.category?.name ?? 'Uncategorized', (m.get(r.category?.name ?? 'Uncategorized') ?? 0) + r.amountCents);
      return [...m.entries()].map(([name, cents]) => ({ name, cents })).sort((a, b) => b.cents - a.cents);
    };
    const clientsMap = new Map<string, { name: string; cents: number }>();
    for (const r of income) {
      const key = r.clientId ?? 'payee:' + (r.payee ?? 'Other');
      const e = clientsMap.get(key) ?? { name: r.client ? clientDisplayName(r.client) : (r.payee || 'Other income'), cents: 0 };
      e.cents += r.amountCents; clientsMap.set(key, e);
    }
    const topClients = [...clientsMap.values()].filter(c => c.cents > 0).sort((a, b) => b.cents - a.cents).slice(0, 10);
    const eventsWithIncome = new Set(income.filter(r => r.eventId && r.amountCents > 0).map(r => r.eventId)).size;
    const years = (await prisma.ledgerTransaction.findMany({ where: { tenantId: who.tenantId, amountCents: { not: 0 } }, select: { date: true }, orderBy: { date: 'asc' }, take: 1 }))[0];
    const summary = {
      year, firstYear: years ? years.date.getUTCFullYear() : year,
      grossIncome, refunds, totalIncome, totalExpense, net: totalIncome - totalExpense,
      quarters, incomeByCategory: byCat(income), expenseByCategory: byCat(expense), topClients,
      events: eventsWithIncome, avgPerEvent: eventsWithIncome ? Math.round(grossIncome / eventsWithIncome) : 0,
      transactions: rows.length,
      todo: {
        uncategorized: rows.filter(r => !r.categoryId).length,
        expensesWithoutReceipt: expense.filter(r => r.source === 'manual' && !r.receiptUrl).length,
        unverified: rows.filter(r => !r.verified).length,
      },
    };
    if (asCsv) {
      return download(`year-end-summary-${year}.csv`, csv([
        [`Year-End Summary ${year}`],
        [],
        ['Income (before refunds)', money(grossIncome)], ['Refunds', '-' + money(refunds)], ['Total income', money(totalIncome)],
        ['Total expenses', money(totalExpense)], ['Net profit', money(totalIncome - totalExpense)],
        ['Events with income', eventsWithIncome], ['Average income per event', money(summary.avgPerEvent)],
        [],
        ['Quarter', 'Income', 'Expenses', 'Net'], ...quarters.map(q => [`Q${q.quarter}`, money(q.income), money(q.expense), money(q.net)]),
        [],
        ['Income by category', 'Total'], ...summary.incomeByCategory.map(c => [c.name, money(c.cents)]),
        [],
        ['Expenses by category', 'Total'], ...summary.expenseByCategory.map(c => [c.name, money(c.cents)]),
        [],
        ['Top clients', 'Total'], ...topClients.map(c => [c.name, money(c.cents)]),
        [],
        [TAX_DISCLAIMER], [MILEAGE_DISCLAIMER],
      ]));
    }
    return NextResponse.json(summary);
  }

  // Reports cover the date range only (other filters don't apply)
  const where = ledgerWhere(who.tenantId, { from: f.from, to: f.to });

  if (report === 'clients') {
    const rows = await prisma.ledgerTransaction.findMany({
      where: { ...where, type: 'INCOME' },
      select: { amountCents: true, clientId: true, payee: true, client: { select: { firstName: true, lastName: true, company: true } } },
    });
    const by = new Map<string, { name: string; cents: number; count: number }>();
    for (const r of rows) {
      const key = r.clientId ?? 'payee:' + (r.payee ?? 'Other');
      const name = r.client ? clientDisplayName(r.client) : (r.payee || 'Other income');
      const e = by.get(key) ?? { name, cents: 0, count: 0 };
      e.cents += r.amountCents; e.count++;
      by.set(key, e);
    }
    const list = [...by.values()].sort((a, b) => b.cents - a.cents);
    if (asCsv) return download(`client-sales-${range}.csv`, csv([['Client', 'Payments', 'Total'], ...list.map(c => [c.name, c.count, money(c.cents)])]));
    return NextResponse.json({ clients: list, total: list.reduce((n, c) => n + c.cents, 0) });
  }

  // Profit & Loss
  const rows = await prisma.ledgerTransaction.findMany({ where, select: { type: true, amountCents: true, date: true, category: { select: { name: true } } } });
  const months = [...new Set(rows.map(r => monthKey(r.date)))].sort();
  const lines = (type: 'INCOME' | 'EXPENSE') => {
    const by = new Map<string, Record<string, number>>();
    for (const r of rows.filter(x => x.type === type)) {
      const name = r.category?.name ?? 'Uncategorized';
      const m = by.get(name) ?? {};
      m[monthKey(r.date)] = (m[monthKey(r.date)] ?? 0) + r.amountCents;
      by.set(name, m);
    }
    return [...by.entries()].map(([name, byMonth]) => ({ name, byMonth, total: Object.values(byMonth).reduce((a, b) => a + b, 0) })).sort((a, b) => b.total - a.total);
  };
  const income = lines('INCOME');
  const expense = lines('EXPENSE');
  const totalOf = (l: { total: number }[]) => l.reduce((n, x) => n + x.total, 0);
  const monthTotal = (l: { byMonth: Record<string, number> }[], m: string) => l.reduce((n, x) => n + (x.byMonth[m] ?? 0), 0);

  if (asCsv) {
    const head = ['', ...months, 'Total'];
    const row = (name: string, byMonth: Record<string, number>, total: number) => [name, ...months.map(m => money(byMonth[m] ?? 0)), money(total)];
    const sumRow = (label: string, l: typeof income) => [label, ...months.map(m => money(monthTotal(l, m))), money(totalOf(l))];
    return download(`profit-and-loss-${range}.csv`, csv([
      head,
      ['Income'], ...income.map(l => row(l.name, l.byMonth, l.total)), sumRow('Total income', income),
      [],
      ['Expenses'], ...expense.map(l => row(l.name, l.byMonth, l.total)), sumRow('Total expenses', expense),
      [],
      ['Net profit', ...months.map(m => money(monthTotal(income, m) - monthTotal(expense, m))), money(totalOf(income) - totalOf(expense))],
      [],
      [TAX_DISCLAIMER], [MILEAGE_DISCLAIMER],
    ]));
  }
  return NextResponse.json({ months, income, expense, totalIncome: totalOf(income), totalExpense: totalOf(expense), net: totalOf(income) - totalOf(expense) });
}
