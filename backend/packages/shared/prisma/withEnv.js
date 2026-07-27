// Runs the Prisma CLI with the repo-root env loaded.
//
// The whole repo shares ONE env file at the repository root (.env.local, falling
// back to .env) — see config/env.ts. The Prisma CLI only auto-loads a .env next
// to the schema, so without this wrapper DATABASE_URL/DIRECT_URL are missing and
// every prisma command fails.
//
//   node prisma/withEnv.js db push
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '../../../..');
require('dotenv').config({ path: path.join(repoRoot, '.env.local') });
require('dotenv').config({ path: path.join(repoRoot, '.env') });

const result = spawnSync('npx', ['prisma', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
});
process.exit(result.status ?? 1);
