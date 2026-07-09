import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import { fmtCents } from '@/lib/utils';

const S = StyleSheet.create({
  page:      { fontFamily: 'Helvetica', fontSize: 10, color: '#111827', padding: 48 },
  header:    { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 32 },
  company:   { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  docTitle:  { fontSize: 22, fontFamily: 'Helvetica-Bold', color: '#3b82f6', textAlign: 'right' },
  docNum:    { fontSize: 11, color: '#6b7280', textAlign: 'right', marginTop: 2 },
  metaRow:   { flexDirection: 'row', gap: 40, marginBottom: 20 },
  metaItem:  { flex: 1 },
  metaValue: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  label:     { fontSize: 8, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 3 },
  divider:   { borderBottomWidth: 1, borderColor: '#e5e7eb', marginVertical: 12 },
  tableHead: { flexDirection: 'row', backgroundColor: '#f9fafb', padding: '8 0', borderBottomWidth: 1, borderColor: '#e5e7eb' },
  tableRow:  { flexDirection: 'row', padding: '8 0', borderBottomWidth: 1, borderColor: '#f3f4f6' },
  col1:      { flex: 3 },
  col2:      { flex: 1, textAlign: 'right' },
  thText:    { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#6b7280', textTransform: 'uppercase' },
  totalRow:  { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 },
  totalLbl:  { width: 100, textAlign: 'right', color: '#6b7280', paddingRight: 12 },
  totalVal:  { width: 80, textAlign: 'right', fontFamily: 'Helvetica-Bold' },
  note:      { backgroundColor: '#eff6ff', padding: 12, borderRadius: 4, marginTop: 24, borderLeftWidth: 3, borderColor: '#3b82f6' },
  footer:    { position: 'absolute', bottom: 32, left: 48, right: 48, fontSize: 8, color: '#9ca3af', textAlign: 'center' },
});

const makeFmt = (cur: string) => (c: number) => fmtCents(c, cur);
const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '—';

export function QuotePDF({ quote, branding }: { quote: any; branding: any }) {
  const fmt = makeFmt(quote.currency ?? branding?.currency ?? 'usd');
  const taxLabel = branding?.taxLabel || 'Tax';
  return (
    <Document title={`Quote ${quote.quoteNumber}`}>
      <Page size="A4" style={S.page}>
        <View style={S.header}>
          <View>
            <Text style={S.company}>{branding?.companyName ?? 'Your Company'}</Text>
            {branding?.websiteUrl && <Text style={{ fontSize: 9, color: '#6b7280' }}>{branding.websiteUrl}</Text>}
            {branding?.replyToEmail && <Text style={{ fontSize: 9, color: '#6b7280' }}>{branding.replyToEmail}</Text>}
          </View>
          <View>
            <Text style={S.docTitle}>QUOTE</Text>
            <Text style={S.docNum}>{quote.quoteNumber}</Text>
          </View>
        </View>

        <View style={S.metaRow}>
          <View style={S.metaItem}>
            <Text style={S.label}>Prepared For</Text>
            <Text style={S.metaValue}>{quote.client?.firstName} {quote.client?.lastName}</Text>
            <Text style={{ fontSize: 9, color: '#6b7280' }}>{quote.client?.email}</Text>
          </View>
          <View style={S.metaItem}>
            <Text style={S.label}>Quote Date</Text>
            <Text style={S.metaValue}>{fmtDate(quote.createdAt)}</Text>
          </View>
          {quote.expiresAt && (
            <View style={S.metaItem}>
              <Text style={S.label}>Valid Until</Text>
              <Text style={S.metaValue}>{fmtDate(quote.expiresAt)}</Text>
            </View>
          )}
          {quote.event && (
            <View style={S.metaItem}>
              <Text style={S.label}>Event</Text>
              <Text style={S.metaValue}>{quote.event.title}</Text>
              {quote.event.eventDate && <Text style={{ fontSize: 9, color: '#6b7280' }}>{fmtDate(quote.event.eventDate)}</Text>}
            </View>
          )}
        </View>

        <View style={S.divider} />

        <View style={S.tableHead}>
          <Text style={[S.col1, S.thText]}>Description</Text>
          <Text style={[S.col2, S.thText]}>Qty</Text>
          <Text style={[S.col2, S.thText]}>Unit Price</Text>
          <Text style={[S.col2, S.thText]}>Amount</Text>
        </View>
        {quote.lineItems?.map((li: any) => (
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

        <View style={{ marginTop: 16 }}>
          {quote.subtotalCents !== quote.totalCents && (
            <View style={S.totalRow}>
              <Text style={S.totalLbl}>Subtotal</Text>
              <Text style={S.totalVal}>{fmt(quote.subtotalCents ?? quote.totalCents)}</Text>
            </View>
          )}
          {(quote.taxAmountCents ?? 0) > 0 && (
            <View style={S.totalRow}>
              <Text style={S.totalLbl}>{taxLabel}</Text>
              <Text style={S.totalVal}>{fmt(quote.taxAmountCents)}</Text>
            </View>
          )}
          <View style={S.divider} />
          <View style={S.totalRow}>
            <Text style={[S.totalLbl, { fontFamily: 'Helvetica-Bold', fontSize: 12 }]}>Total</Text>
            <Text style={[S.totalVal, { fontSize: 14, color: '#3b82f6' }]}>{fmt(quote.totalCents)}</Text>
          </View>
        </View>

        {quote.notes && (
          <View style={S.note}>
            <Text style={{ fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#1d4ed8', marginBottom: 4, textTransform: 'uppercase' }}>Notes</Text>
            <Text style={{ color: '#1e40af' }}>{quote.notes}</Text>
          </View>
        )}

        <Text style={S.footer}>This quote is valid until {fmtDate(quote.expiresAt) ?? 'further notice'}. Contact us with any questions.</Text>
      </Page>
    </Document>
  );
}
