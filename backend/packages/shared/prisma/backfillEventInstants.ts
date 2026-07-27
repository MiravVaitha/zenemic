/**
 * Backfill `startsAt`/`endsAt` for events that were persisted without them.
 *
 * Events created before the timing floor landed could keep `startsAt = NULL`
 * (typically "All day" events, where the AI resolved a date but no instant).
 * `deriveEventKind` reads "no start" as "hasn't happened yet", so those events
 * sit under Planned forever. This recovers the instants from the display
 * labels using the SAME helper the create/update paths now use.
 *
 *   npm run backfill:instants -w @zenemic/shared -- --dry   # preview only
 *   npm run backfill:instants -w @zenemic/shared            # write
 */
import path from 'path';
import dotenv from 'dotenv';

const repoRoot = path.resolve(__dirname, '../../../..');
dotenv.config({ path: path.join(repoRoot, '.env.local') });
dotenv.config({ path: path.join(repoRoot, '.env') });

import { PrismaClient } from '@prisma/client';
import { deriveEventKind } from '../src/domain/eventKind';
import { resolveInstantsFromLabels } from '../src/domain/eventTiming';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry');

async function main() {
  const now = new Date();
  const stuck = await prisma.event.findMany({
    where: { startsAt: null },
    orderBy: { createdAt: 'asc' },
    select: { id: true, title: true, dateLabel: true, timeLabel: true, createdAt: true },
  });

  console.log(`${dryRun ? 'DRY RUN — ' : ''}events with startsAt = NULL: ${stuck.length}\n`);
  if (!stuck.length) return;

  let fixed = 0;
  for (const e of stuck) {
    // No year in a label like "4th July" — read it relative to when it was written.
    const referenceYear = e.createdAt.getFullYear();
    const resolved = resolveInstantsFromLabels(e.dateLabel, e.timeLabel, referenceYear);

    console.log(`${e.title}`);
    console.log(`  labels     : ${JSON.stringify(e.dateLabel)} / ${JSON.stringify(e.timeLabel)}`);
    if (!resolved) {
      console.log('  -> UNRESOLVED (label has no readable date) — left untouched\n');
      continue;
    }
    const hasYear = /\b\d{4}\b/.test(e.dateLabel);
    console.log(`  year source: ${hasYear ? 'from label' : `assumed ${referenceYear} (createdAt)`}`);
    console.log(`  startsAt   : NULL -> ${resolved.startsAt.toISOString()}`);
    console.log(`  endsAt     : NULL -> ${resolved.endsAt ? resolved.endsAt.toISOString() : 'NULL'}`);
    console.log(
      `  bucket     : planned -> ${deriveEventKind(resolved.startsAt, resolved.endsAt, now).toLowerCase()}\n`,
    );

    if (!dryRun) {
      await prisma.event.update({
        where: { id: e.id },
        data: { startsAt: resolved.startsAt, endsAt: resolved.endsAt },
      });
    }
    fixed += 1;
  }

  console.log(dryRun ? `Would update ${fixed} event(s). Re-run without --dry to apply.` : `Updated ${fixed} event(s).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
