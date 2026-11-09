import { execSync } from 'child_process';

export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://gnolasco@localhost:5433/boothgen_genie_test';
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) throw new Error('Tests only run against a local database');
  execSync('npx prisma db push --skip-generate --accept-data-loss', { env: { ...process.env, DATABASE_URL: url }, stdio: 'ignore' });
}
