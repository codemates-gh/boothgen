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

// Guest- and client-facing photo lists leave out Genie printer sheets (archive copies of the gallery image) and
// boomerang posters (shown as the clip's thumbnail instead)
export const NOT_PRINT_SHEET = { OR: [{ genieKind: null }, { genieKind: { notIn: ['print', 'boomerangPoster'] } }] };

// The operator's own gallery view keeps printer sheets but shows a boomerang's poster only as its thumbnail
export const NOT_BOOMERANG_POSTER = { OR: [{ genieKind: null }, { genieKind: { not: 'boomerangPoster' } }] };
