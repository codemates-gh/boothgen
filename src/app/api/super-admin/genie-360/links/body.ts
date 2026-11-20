import { z } from 'zod';

const name = z.string().trim().min(1, 'Add the site name').max(60, 'Keep the name to 60 characters');
const url = z.string().trim().url('Add the full link, starting with https://').refine(u => u.startsWith('https://'), 'Add the full link, starting with https://');
const note = z.string().trim().max(140, 'Keep the note to 140 characters');

export const MusicLinkBody = z.object({ name, url, note: note.default('') }).strict();
export const MusicLinkPatch = z.object({ name, url, note, isActive: z.boolean(), sortOrder: z.number().int().min(0).max(1000) }).partial().strict();
