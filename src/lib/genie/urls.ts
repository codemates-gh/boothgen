import type { Gallery } from '@prisma/client';

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.boothgen.com').replace(/\/$/, '');
}

export function galleryUrl(gallery: Pick<Gallery, 'clientToken'>): string {
  return `${appUrl()}/g/${gallery.clientToken}`;
}

export function sessionUrl(gallery: Pick<Gallery, 'clientToken'>, publicToken: string): string {
  return `${galleryUrl(gallery)}/s/${publicToken}`;
}

// Guest- and client-facing photo lists leave out Genie printer sheets (archive copies of the gallery image)
export const NOT_PRINT_SHEET = { OR: [{ genieKind: null }, { genieKind: { not: 'print' } }] };
