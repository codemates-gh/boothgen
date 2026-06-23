import React from 'react';
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const S = StyleSheet.create({
  page:       { fontFamily: 'Helvetica', fontSize: 10, color: '#111827', padding: 48 },
  title:      { fontSize: 20, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  subtitle:   { fontSize: 10, color: '#6b7280', marginBottom: 24 },
  parties:    { flexDirection: 'row', gap: 32, marginBottom: 24 },
  party:      { flex: 1, backgroundColor: '#f9fafb', padding: 12, borderRadius: 4 },
  partyLabel: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 4 },
  partyName:  { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  divider:    { borderBottomWidth: 1, borderColor: '#e5e7eb', marginVertical: 16 },
  bodyLabel:  { fontSize: 8, fontFamily: 'Helvetica-Bold', color: '#9ca3af', textTransform: 'uppercase', marginBottom: 10 },
  para:       { marginBottom: 8, lineHeight: 1.5, color: '#374151' },
  sigBlock:   { marginTop: 32, flexDirection: 'row', gap: 40 },
  sig:        { flex: 1 },
  sigLabel:   { fontSize: 8, color: '#9ca3af', textTransform: 'uppercase', marginBottom: 20 },
  sigLine:    { borderBottomWidth: 1, borderColor: '#9ca3af', marginBottom: 4 },
  sigName:    { fontSize: 9, color: '#6b7280' },
  sigDate:    { fontSize: 8, color: '#9ca3af', marginTop: 2 },
  badge:      { backgroundColor: '#dcfce7', color: '#166534', fontSize: 9, fontFamily: 'Helvetica-Bold', padding: '3 8', borderRadius: 4, alignSelf: 'flex-start', marginBottom: 24 },
  footer:     { position: 'absolute', bottom: 32, left: 48, right: 48, fontSize: 8, color: '#9ca3af', textAlign: 'center' },
});

function stripHtml(html: string): string {
  return html
    .replace(/<\/?(p|div|br|h[1-6])[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

const fmtDate = (d: any) => d ? new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }) : '';
const fmtDateTime = (d: any) => d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';

export function ContractPDF({ contract, branding }: { contract: any; branding: any }) {
  const content = contract.renderedContent ? stripHtml(contract.renderedContent) : '';
  const paragraphs = content.split('\n\n').filter(Boolean);

  const isFullySigned = contract.status === 'FULLY_EXECUTED';

  return (
    <Document title={contract.title}>
      <Page size="A4" style={S.page}>
        {isFullySigned && <Text style={S.badge}>✓ Fully Executed</Text>}

        <Text style={S.title}>{contract.title}</Text>
        <Text style={S.subtitle}>
          Prepared by {branding?.companyName ?? 'Company'} • {fmtDate(contract.createdAt)}
        </Text>

        <View style={S.parties}>
          <View style={S.party}>
            <Text style={S.partyLabel}>Host / Provider</Text>
            <Text style={S.partyName}>{branding?.companyName ?? 'Provider'}</Text>
            {branding?.replyToEmail && <Text style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>{branding.replyToEmail}</Text>}
          </View>
          <View style={S.party}>
            <Text style={S.partyLabel}>Client</Text>
            <Text style={S.partyName}>{contract.client?.firstName} {contract.client?.lastName}</Text>
            <Text style={{ fontSize: 9, color: '#6b7280', marginTop: 2 }}>{contract.client?.email}</Text>
          </View>
        </View>

        <View style={S.divider} />

        <Text style={S.bodyLabel}>Agreement Terms</Text>
        {paragraphs.map((p: string, i: number) => (
          <Text key={i} style={S.para}>{p}</Text>
        ))}

        <View style={S.divider} />

        <View style={S.sigBlock}>
          <View style={S.sig}>
            <Text style={S.sigLabel}>Client Signature</Text>
            {contract.clientSignedAt ? (
              <>
                <View style={S.sigLine} />
                <Text style={S.sigName}>{contract.client?.firstName} {contract.client?.lastName}</Text>
                <Text style={S.sigDate}>Signed {fmtDateTime(contract.clientSignedAt)}</Text>
              </>
            ) : (
              <View style={[S.sigLine, { borderStyle: 'dashed' }]} />
            )}
          </View>
          <View style={S.sig}>
            <Text style={S.sigLabel}>Host Signature</Text>
            {contract.hostSignedAt ? (
              <>
                <View style={S.sigLine} />
                <Text style={S.sigName}>{branding?.companyName ?? 'Host'}</Text>
                <Text style={S.sigDate}>Signed {fmtDateTime(contract.hostSignedAt)}</Text>
              </>
            ) : (
              <View style={[S.sigLine, { borderStyle: 'dashed' }]} />
            )}
          </View>
        </View>

        <Text style={S.footer}>{contract.title} — {branding?.companyName ?? ''} — Confidential</Text>
      </Page>
    </Document>
  );
}
