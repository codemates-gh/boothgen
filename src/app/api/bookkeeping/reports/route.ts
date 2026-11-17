export const dynamic = 'force-dynamic';
// Bookkeeping reports for a date range:
//   ?report=pl       Profit & Loss: income and expenses by category, month by month, and net
//   ?report=clients  Client Sales: income per client
//   ?report=transactions&format=csv  the filtered transaction list (same filters as the Bookkeeping page)
// Add &format=csv to download any of them.
import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma/client';
import { bookkeeper } from '@/lib/bookkeeping/auth';
import { ledgerWhere, filtersFrom } from '@/lib/bookkeeping/query';
import { clientDisplayName } from '@/lib/clientName';

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
    ]));
  }
  return NextResponse.json({ months, income, expense, totalIncome: totalOf(income), totalExpense: totalOf(expense), net: totalOf(income) - totalOf(expense) });
}
