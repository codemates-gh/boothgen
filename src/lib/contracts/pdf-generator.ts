
import { Document, Page, Text, View, Image, StyleSheet, renderToBuffer } from '@react-pdf/renderer';
import { createHash } from 'crypto';
import { format } from 'date-fns';
import { uploadContractPdf } from '@/lib/storage/blob';
import React from 'react';

export interface ContractPdfInput {
  contractId: string; tenantId: string; title: string; renderedContent: string;
  clientFullName: string; clientEmail: string; clientSignatureDataUrl: string; clientSignedAt: Date; clientIpAddress: string;
  hostFullName: string; hostEmail: string; hostSignatureDataUrl: string; hostSignedAt: Date; hostIpAddress: string;
  branding: { companyName: string; primaryColor: string; logoUrl?: string; invoiceFooterText?: string };
}

const S = (c: string) => StyleSheet.create({
  page: { paddingTop: 60, paddingBottom: 80, paddingHorizontal: 72, fontFamily: 'Helvetica', fontSize: 10, color: '#1a1a1a' },
  header: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 2, borderBottomColor: c, paddingBottom: 16, marginBottom: 24 },
  coName: { fontSize: 14, fontFamily: 'Helvetica-Bold' },
  title: { fontSize: 13, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  meta: { fontSize: 8, color: '#6b7280' },
  banner: { backgroundColor: '#fff7ed', borderWidth: 1, borderColor: '#fed7aa', borderRadius: 4, padding: 8, marginBottom: 20, alignItems: 'center' },
  bannerTxt: { fontSize: 8, fontFamily: 'Helvetica-Bold', color: c, letterSpacing: 0.5 },
  body: { fontSize: 10, lineHeight: 1.7, marginBottom: 24 },
  sigs: { flexDirection: 'row', gap: 40, marginTop: 36, paddingTop: 24, borderTopWidth: 1, borderTopColor: '#d1d5db' },
  sigBlock: { flex: 1 },
  sigLbl: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#6b7280', marginBottom: 8 },
  sigWrap: { height: 60, borderBottomWidth: 1.5, borderBottomColor: '#374151', marginBottom: 6, justifyContent: 'flex-end' },
  sigImg: { height: 52, objectFit: 'contain' },
  sigName: { fontSize: 9, fontFamily: 'Helvetica-Bold', marginBottom: 2 },
  sigMeta: { fontSize: 8, color: '#6b7280', lineHeight: 1.5 },
  audit: { marginTop: 28, padding: 12, backgroundColor: '#f9fafb', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 4 },
  auditTitle: { fontSize: 8, fontFamily: 'Helvetica-Bold', textTransform: 'uppercase', color: '#374151', marginBottom: 6 },
  auditRow: { flexDirection: 'row', marginBottom: 3 },
  auditLbl: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', width: 120, color: '#374151' },
  auditVal: { fontSize: 7.5, color: '#6b7280', flex: 1 },
  hash: { fontSize: 7, color: '#9ca3af', fontFamily: 'Courier', marginTop: 4 },
});

function ContractDoc({ input, hash }: { input: ContractPdfInput; hash: string }) {
  const s = S(input.branding.primaryColor);
  const plain = input.renderedContent.replace(/<brs*/?>/gi,'
').replace(/</p>/gi,'

').replace(/<[^>]+>/g,'').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').trim();
  return (
    React.createElement(Document, { title: input.title },
      React.createElement(Page, { size: 'LETTER', style: s.page },
        React.createElement(View, { style: s.header },
          React.createElement(View, null,
            input.branding.logoUrl
              ? React.createElement(Image, { src: input.branding.logoUrl, style: { width: 120, height: 40, objectFit: 'contain' } })
              : React.createElement(Text, { style: s.coName }, input.branding.companyName)
          ),
          React.createElement(View, { style: { alignItems: 'flex-end' } },
            React.createElement(Text, { style: s.title }, input.title),
            React.createElement(Text, { style: s.meta }, 'ID: ' + input.contractId),
            React.createElement(Text, { style: s.meta }, 'Generated: ' + format(new Date(), 'MMMM d, yyyy'))
          )
        ),
        React.createElement(View, { style: s.banner }, React.createElement(Text, { style: s.bannerTxt }, 'FULLY EXECUTED — LOCKED AND LEGALLY BINDING')),
        React.createElement(View, null, React.createElement(Text, { style: s.body }, plain)),
        React.createElement(View, { style: s.sigs },
          React.createElement(View, { style: s.sigBlock },
            React.createElement(Text, { style: s.sigLbl }, 'Client Signature'),
            React.createElement(View, { style: s.sigWrap }, React.createElement(Image, { src: input.clientSignatureDataUrl, style: s.sigImg })),
            React.createElement(Text, { style: s.sigName }, input.clientFullName),
            React.createElement(Text, { style: s.sigMeta }, input.clientEmail),
            React.createElement(Text, { style: s.sigMeta }, format(input.clientSignedAt, "MMM d, yyyy 'at' h:mm a")),
            React.createElement(Text, { style: s.sigMeta }, 'IP: ' + input.clientIpAddress)
          ),
          React.createElement(View, { style: s.sigBlock },
            React.createElement(Text, { style: s.sigLbl }, input.branding.companyName + ' — Authorized'),
            React.createElement(View, { style: s.sigWrap }, React.createElement(Image, { src: input.hostSignatureDataUrl, style: s.sigImg })),
            React.createElement(Text, { style: s.sigName }, input.hostFullName),
            React.createElement(Text, { style: s.sigMeta }, input.hostEmail),
            React.createElement(Text, { style: s.sigMeta }, format(input.hostSignedAt, "MMM d, yyyy 'at' h:mm a")),
            React.createElement(Text, { style: s.sigMeta }, 'IP: ' + input.hostIpAddress)
          )
        ),
        React.createElement(View, { style: s.audit },
          React.createElement(Text, { style: s.auditTitle }, 'Document Integrity Record'),
          React.createElement(View, { style: s.auditRow }, React.createElement(Text, { style: s.auditLbl }, 'Contract ID:'), React.createElement(Text, { style: s.auditVal }, input.contractId)),
          React.createElement(View, { style: s.auditRow }, React.createElement(Text, { style: s.auditLbl }, 'Client signed:'), React.createElement(Text, { style: s.auditVal }, format(input.clientSignedAt, 'MMM d, yyyy h:mm:ss a') + ' from ' + input.clientIpAddress)),
          React.createElement(View, { style: s.auditRow }, React.createElement(Text, { style: s.auditLbl }, 'Host signed:'), React.createElement(Text, { style: s.auditVal }, format(input.hostSignedAt, 'MMM d, yyyy h:mm:ss a') + ' from ' + input.hostIpAddress)),
          React.createElement(Text, { style: s.hash }, 'SHA-256: ' + hash),
          input.branding.invoiceFooterText ? React.createElement(Text, { style: s.auditVal }, input.branding.invoiceFooterText) : null
        )
      )
    )
  );
}

export async function generateLockedContractPdf(input: ContractPdfInput) {
  const raw = [input.contractId,input.renderedContent,input.clientSignatureDataUrl,input.clientSignedAt.toISOString(),input.clientIpAddress,input.hostSignatureDataUrl,input.hostSignedAt.toISOString(),input.hostIpAddress].join('|');
  const contentHash = createHash('sha256').update(raw).digest('hex');
  const buf = Buffer.from(await renderToBuffer(React.createElement(ContractDoc, { input, hash: contentHash })));
  const blobPath = 'contracts/' + input.tenantId + '/' + input.contractId + '/' + contentHash.slice(0,16) + '-signed.pdf';
  const pdfUrl = await uploadContractPdf(buf, blobPath);
  return { pdfUrl, contentHash };
}
