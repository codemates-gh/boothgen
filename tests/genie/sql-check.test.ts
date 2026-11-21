import { describe, expect, it } from 'vitest';
import fs from 'fs';
// @ts-expect-error plain .mjs script, no types
import { CHECK_FILE, buildCheck, expectedRows } from '../../scripts/genie-sql-check.mjs';

// docs/genie/check-production-sql.sql is generated from every apply-production-*.sql; a new SQL file must regenerate it
describe('production SQL check', () => {
  it('is up to date with docs/genie/apply-production-*.sql (run node scripts/genie-sql-check.mjs)', () => {
    expect(fs.readFileSync(CHECK_FILE, 'utf8')).toBe(buildCheck());
  });

  it('covers every apply-production file that changes the schema', () => {
    const { files, rows, skipped } = expectedRows();
    const covered = new Set(rows.map((r: string[]) => r[0]));
    for (const f of files) expect(covered.has(f) || skipped.includes(f)).toBe(true);
    expect(rows).toContainEqual(['apply-production-genie-360.sql', 'genie_spin_styles', null]);
    expect(rows).toContainEqual(['apply-production-props-on-video.sql', 'gallery_assets', 'propId']);
  });
});
