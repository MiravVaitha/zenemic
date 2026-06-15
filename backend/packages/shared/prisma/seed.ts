/**
 * Optional dev seed. Creates a real Supabase Auth user (so you can log in),
 * a matching profile row, and one fully-formed event. Run with `npm run seed`.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY + DATABASE_URL in your env.
 * Login: eve@email.com / password123
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

// Load the one shared env file at the repository root, same as the services.
const ENV_ROOT = path.resolve(__dirname, '../../../..'); // packages/shared/prisma -> repo root
loadEnv({ path: path.join(ENV_ROOT, '.env.local') });
loadEnv({ path: path.join(ENV_ROOT, '.env') });
import { createClient } from '@supabase/supabase-js';

const prisma = new PrismaClient();
const supabase = createClient(
  process.env.SUPABASE_URL as string,
  process.env.SUPABASE_SERVICE_ROLE_KEY as string,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const EMAIL = 'eve@email.com';

async function getOrCreateAuthUser(): Promise<string> {
  const created = await supabase.auth.admin.createUser({
    email: EMAIL,
    password: 'password123',
    email_confirm: true,
    user_metadata: { name: 'Eve Lambert' },
  });
  if (created.data.user) return created.data.user.id;

  // Already exists — find them by listing (small dev project).
  const { data } = await supabase.auth.admin.listUsers();
  const existing = data.users.find((u) => u.email === EMAIL);
  if (!existing) throw new Error(`Could not create or find auth user: ${created.error?.message}`);
  return existing.id;
}

async function main() {
  const userId = await getOrCreateAuthUser();

  const user = await prisma.user.upsert({
    where: { id: userId },
    update: {},
    create: { id: userId, email: EMAIL, name: 'Eve Lambert' },
  });

  const event = await prisma.event.create({
    data: {
      userId: user.id,
      title: "Mira's 28th Birthday",
      dateLabel: '07 Jun 2026',
      timeLabel: '7:30 PM',
      kind: 'PLANNED',
      status: 'ACTIVE',
      location: 'Sister Ray, Hackney',
      attendeesCount: 12,
      budgetMinor: 48000,
      currency: 'gbp',
      splitMode: 'EVEN',
      sourceMessage:
        "Pulling together a low-key dinner for Mira's birthday at Sister Ray in Hackney, Saturday 7th June from 7:30. Wines on me, food split evenly.",
      attendees: {
        create: [
          { name: 'Eve Lambert', email: EMAIL, isHost: true, rsvp: 'GOING' },
          { name: 'Jules', rsvp: 'PENDING' },
          { name: 'Marcus', rsvp: 'PENDING' },
          { name: 'Anya', rsvp: 'GOING' },
        ],
      },
      stages: {
        create: [
          { order: 0, tag: 'SETUP', t: 'T -2H', heading: 'Cake & playlist drop-off', kind: 'PAST', body: 'Arrive at Sister Ray to confirm the booking. Drop off the cake.' },
          { order: 1, tag: 'LIVE', t: 'T +0', heading: 'Sit down for set menu', kind: 'CURRENT', body: 'Three courses. Toast at the end of the starter.' },
          { order: 2, tag: 'KEY', t: 'T +1.5H', heading: 'Cake & candles', kind: 'NEXT', body: 'Cake out at 9:30. Mira blows out, photo, then service slices.' },
          { order: 3, tag: 'WRAP', t: 'T +4.5H', heading: 'Settle & send-off', kind: 'NEXT', body: 'Settle the bill. Trigger the payment splitter. Confirm everyone has a way home.' },
        ],
      },
    },
  });

  // eslint-disable-next-line no-console
  console.log(`Seeded auth user ${EMAIL} (${userId}) and event ${event.id}`);
}

main()
  .catch((e) => {
    // eslint-disable-next-line no-console
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
