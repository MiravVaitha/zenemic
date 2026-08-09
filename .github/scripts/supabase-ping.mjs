// Supabase keepalive ping.
//
// Supabase pauses a free-plan project after 7 days without user *database*
// activity. This opens a real Postgres connection and reads a real table so the
// inactivity timer resets.
//
// It deliberately does NOT go through the Zenemic backend. That backend runs
// only on a dev machine, and even if it were hosted, `/api/health` answers from
// a boot-time constant and never queries the database (Prisma connects lazily),
// so pinging it would not count as activity.

import { Client } from 'pg';

const connectionString = process.env.DIRECT_URL;

if (!connectionString) {
  console.error(
    'DIRECT_URL is not set. Add the SUPABASE_DIRECT_URL repository secret ' +
      '(Settings -> Secrets and variables -> Actions).',
  );
  process.exit(1);
}

// schema.prisma carries no @@map on any model, so Prisma's model names reach
// Postgres verbatim. The identifier is PascalCase and has to stay quoted.
// count(*) is valid on an empty table, so this never depends on there being data.
const QUERY = 'select count(*)::int as count from "User"';

const ATTEMPTS = 3;
const BACKOFF_MS = [2_000, 8_000];

async function ping(attempt) {
  const client = new Client({
    connectionString,
    // Load-bearing, not belt-and-braces: pg does not negotiate TLS from a bare
    // postgresql:// URL, and Supabase refuses unencrypted connections, so
    // without this the connect fails outright. Chain verification is skipped on
    // purpose — pinning Supabase's CA would break silently on rotation, and the
    // only thing crossing this connection is a row count.
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
    query_timeout: 15_000,
  });

  try {
    await client.connect();
    const result = await client.query(QUERY);
    console.log(`OK (attempt ${attempt}) — "User" holds ${result.rows[0].count} row(s).`);
  } finally {
    await client.end().catch(() => {});
  }
}

for (let attempt = 1; attempt <= ATTEMPTS; attempt += 1) {
  try {
    await ping(attempt);
    process.exit(0);
  } catch (err) {
    // Log err.message only. It can name the host but never the password, and
    // the connection string itself must not reach a public build log.
    console.error(`Attempt ${attempt}/${ATTEMPTS} failed: ${err.message}`);

    const wait = BACKOFF_MS[attempt - 1];
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

console.error('All attempts failed — Supabase was not reached, so the pause timer did not reset.');
process.exit(1);
