import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { fmtCents } from '@/lib/utils';

const S = StyleSheet.create({
  page:       { fontFamily: 'Helvetica', fontSize: 10, color: '#111827', padding: 48 },
  header:     { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32 },
  company:    { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  docTitle:   { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#f97316', textAlign: 'right' },
  docNum:     { fontSize: 11, color: '#6b7280', textAlign: 'right', marginTop: 2 },
  section:    { marginBottom: 20 },
  label:      { fontSize: 8, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  metaRow:    { flexDirection: 'row', gap: 40, marginBottom: 20 },
  metaItem:   { flex: 1 },
  metaValue:  { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  divider:    { borderBottomWidth: 1, borderColor: '#e5e7eb', marginVertical: 12 },
  tableHead:  { flexDirection: 'row', backgroundColor: '#f9fafb', padding: '8 0', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  tableRow:   { flexDirection: 'row', padding: '8 0', borderBottomWidth: 1, borderColor: '#f3f4f6' },
  col1:       { flex: 3 },
  col2:       { flex: 1, textAlign: 'right' },
  thText:     { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#6b7280', textTransform: 'uppercase' },
  totalRow:   { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  totalLabel: { width: 120, textAlign: 'right', color: '#6b7280', paddingRight: 12 },
  totalVal:   { width: 80, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  balanceRow: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  balLabel:   { width: 120, textAlign: 'right', paddingRight: 12, fontFamily: 'Helvetica-Bold', fontSize: 11 },
  balVal:     { width: 80, textAlign: 'right', fontFamily: 'Helvetica-Bold', fontSize: 13, color: '#f97316' },
  notes:      { backgroundColor: '#f9fafb', padding: 12, borderRadius: 4, marginTop: 8 },
  notesLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 },
  footer:     { position: 'absolute', bottom: 32, left: 48, right: 48, fontSize: 8, color: '#9ca3af', textAlign: 'center' },
});

const makeFmt = (cur: string) => (c: number) => fmtCents(c, cur);
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

export function InvoicePDF({ inv, branding }: { inv: any; branding: any }) {
  const fmt = makeFmt(inv.currency ?? branding?.currency ?? 'usd');
  const taxLabel = branding?.taxLabel || 'Tax';
  return (
    <Document title={`Invoice ${inv.invoiceNumber}`}>
      <Page size="A4" style={S.page}>

        {/* Header */}
        <View style={S.header}>
          <View>
            <Text style={S.company}>{branding?.companyName ?? 'Your Company'}</Text>
            {branding?.websiteUrl && <Text style={{ fontSize: 9, color: '#6b7280' }}>{branding.websiteUrl}</Text>}
            {branding?.replyToEmail && <Text style={{ fontSize: 9, color: '#6b7280' }}>{branding.replyToEmail}</Text>}
          </View>
          <View>
            <Text style={S.docTitle}>INVOICE</Text>
            <Text style={S.docNum}>{inv.invoiceNumber}</Text>
          </View>
        </View>

        {/* Meta */}
        <View style={S.metaRow}>
          <View style={S.metaItem}>
            <Text style={S.label}>Bill To</Text>
            <Text style={S.metaValue}>{inv.client?.firstName} {inv.client?.lastName}</Text>
            <Text style={{ fontSize: 9, color: '#6b7280' }}>{inv.client?.email}</Text>
            {inv.client?.phone && <Text style={{ fontSize: 9, color: '#6b7280' }}>{inv.client.phone}</Text>}
          </View>
          <View style={S.metaItem}>
            <Text style={S.label}>Invoice Date</Text>
            <Text style={S.metaValue}>{fmtDate(inv.createdAt)}</Text>
          </View>
          {inv.dueDate && (
            <View style={S.metaItem}>
              <Text style={S.label}>Due Date</Text>
              <Text style={S.metaValue}>{fmtDate(inv.dueDate)}</Text>
            </View>
          )}
          {inv.event && (
            <View style={S.metaItem}>
              <Text style={S.label}>Event</Text>
              <Text style={S.metaValue}>{inv.event.title}</Text>
              {inv.event.eventDate && <Text style={{ fontSize: 9, color: '#6b7280' }}>{fmtDate(inv.event.eventDate)}</Text>}
            </View>
          )}
        </View>

        <View style={S.divider} />

        {/* Line items */}
        <View style={S.tableHead}>
          <Text style={[S.col1, S.thText]}>Description</Text>
          <Text style={[S.col2, S.thText]}>Qty</Text>
          <Text style={[S.col2, S.thText]}>Unit Price</Text>
          <Text style={[S.col2, S.thText]}>Amount</Text>
        </View>
        {inv.lineItems?.map((li: any) => (
          <View key={li.id} style={S.tableRow}>
            <View style={S.col1}>
              <Text style={{ fontFamily: 'Helvetica-Bold' }}>{li.description}</Text>
              {li.notes && <Text style={{ fontSize: 8, color: '#6b7280', marginTop: 2 }}>{li.notes}</Text>}
            </View>
            <Text style={S.col2}>{li.quantity}</Text>
            <Text style={S.col2}>{fmt(li.unitPriceCents)}</Text>
            <Text style={S.col2}>{fmt(li.totalCents)}</Text>
          </View>
        ))}

        {/* Totals */}
        <View style={{ marginTop: 16 }}>
          <View style={S.totalRow}>
            <Text style={S.totalLabel}>Subtotal</Text>
            <Text style={S.totalVal}>{fmt(inv.subtotalCents)}</Text>
          </View>
          {inv.taxAmountCents > 0 && (
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>{taxLabel}</Text>
              <Text style={S.totalVal}>{fmt(inv.taxAmountCents)}</Text>
            </View>
          )}
          <View style={S.totalRow}>
            <Text style={[S.totalLabel, { fontFamily: 'Helvetica-Bold', fontSize: 11 }]}>Total</Text>
            <Text style={[S.totalVal, { fontSize: 12, fontFamily: 'Helvetica-Bold' }]}>{fmt(inv.totalCents)}</Text>
          </View>
          {inv.amountPaidCents > 0 && (
            <View style={S.totalRow}>
              <Text style={S.totalLabel}>Paid</Text>
              <Text style={[S.totalVal, { color: '#22c55e' }]}>-{fmt(inv.amountPaidCents)}</Text>
            </View>
          )}
          <View style={[S.divider, { marginTop: 8 }]} />
          <View style={S.balanceRow}>
            <Text style={S.balLabel}>Balance Due</Text>
            <Text style={S.balVal}>{fmt(inv.balanceDueCents)}</Text>
          </View>
        </View>

        {/* Notes */}
        {inv.notes && (
          <View style={[S.notes, { marginTop: 24 }]}>
            <Text style={S.notesLabel}>Notes</Text>
            <Text>{inv.notes}</Text>
          </View>
        )}

        <Text style={S.footer}>Thank you for your business.</Text>
      </Page>
    </Document>
  );
}
