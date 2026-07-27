/**
 * Fallback resolution of an event's machine timestamps from its display labels.
 *
 * The AI extraction is allowed to return `startsAtISO: null` when it can't
 * resolve an instant — most often for an "All day" event, where there is a real
 * date but no clock time. Persisting that null used to leave the event with no
 * timestamp at all, and `deriveEventKind` reads "no start" as "hasn't happened
 * yet", so the event stayed Planned forever.
 *
 * This module is the floor under that: given the labels we always have
 * (`dateLabel`, `timeLabel`), recover a start instant. Pure and side-effect
 * free, like `eventKind.ts` — pass `referenceYear` to keep it deterministic.
 */

const MONTHS = [
  'jan',
  'feb',
  'mar',
  'apr',
  'may',
  'jun',
  'jul',
  'aug',
  'sep',
  'oct',
  'nov',
  'dec',
];

/** Last instant (23:59:59.999) of the local calendar day `d` falls on. */
function endOfLocalDay(d: Date): Date {
  const end = new Date(d);
  end.setHours(23, 59, 59, 999);
  return end;
}

/**
 * Pull the day range out of a display date label.
 *
 * Handles the formats the extraction prompt produces ("07 Jun 2026",
 * "14-16 Jun 2026") plus the looser ones already in the wild ("4th July ",
 * "Jul 8 2026"). The year is optional — when absent we fall back to
 * `referenceYear`, since a label like "4th July" is only meaningful relative to
 * when it was written.
 *
 * Returns null when there is no month or no day to read — we never guess.
 */
export function parseDateLabel(
  dateLabel: string,
  referenceYear: number,
): { firstDay: Date; lastDay: Date } | null {
  // Strip ordinal suffixes ("4th" → "4") so the day numbers parse cleanly.
  const text = dateLabel.toLowerCase().replace(/(\d+)(st|nd|rd|th)\b/g, '$1');

  const monthIndex = MONTHS.findIndex((m) => new RegExp(`\\b${m}`).test(text));
  if (monthIndex === -1) return null;

  const year = text.match(/\b(\d{4})\b/);
  const resolvedYear = year ? Number(year[1]) : referenceYear;

  // Day numbers are 1-2 digits — exclude the 4-digit year from the candidates.
  const days = (text.match(/\b(\d{1,2})\b/g) ?? [])
    .map(Number)
    .filter((n) => n >= 1 && n <= 31);
  if (!days.length) return null;

  const firstDayNum = days[0]!;
  // "14-16 Jun" — a second day number means a multi-day range.
  const lastDayNum = days.length > 1 ? days[days.length - 1]! : firstDayNum;

  const firstDay = new Date(resolvedYear, monthIndex, firstDayNum, 0, 0, 0, 0);
  if (Number.isNaN(firstDay.getTime())) return null;
  const lastDay = new Date(resolvedYear, monthIndex, lastDayNum, 0, 0, 0, 0);

  // A malformed range (16-14) collapses to the single first day.
  return { firstDay, lastDay: lastDay >= firstDay ? lastDay : firstDay };
}

/**
 * Pull a clock time out of a display time label ("7:30 PM", "8pm", "Fri 4 PM").
 *
 * Returns null for "All day" and anything else without a readable time — the
 * caller treats that as a whole-day event rather than inventing an hour.
 */
export function parseTimeLabel(timeLabel: string): { hours: number; minutes: number } | null {
  const match = timeLabel.toLowerCase().match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return null;

  let hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3];

  if (hours > 23 || minutes > 59) return null;
  // Without am/pm a bare hour is ambiguous; only trust it in 24h range.
  if (meridiem === 'pm' && hours < 12) hours += 12;
  if (meridiem === 'am' && hours === 12) hours = 0;

  return { hours, minutes };
}

/**
 * Recover `startsAt`/`endsAt` from the display labels.
 *
 * - a readable time on a single day  → start at that time, no explicit end
 *   (`deriveEventKind` falls back to end-of-day, so it flips at midnight)
 * - "All day", or a multi-day range  → start at local midnight of the first day
 *   and end at the last instant of the last day
 *
 * Returns null when the date can't be read at all, leaving the caller's
 * existing null behaviour untouched.
 */
export function resolveInstantsFromLabels(
  dateLabel: string,
  timeLabel: string,
  referenceYear: number,
): { startsAt: Date; endsAt: Date | null } | null {
  const days = parseDateLabel(dateLabel, referenceYear);
  if (!days) return null;

  const time = parseTimeLabel(timeLabel);
  const multiDay = days.lastDay > days.firstDay;

  if (!time) {
    // Whole-day event: midnight → the very end of the (last) day.
    return { startsAt: days.firstDay, endsAt: endOfLocalDay(days.lastDay) };
  }

  const startsAt = new Date(days.firstDay);
  startsAt.setHours(time.hours, time.minutes, 0, 0);
  return { startsAt, endsAt: multiDay ? endOfLocalDay(days.lastDay) : null };
}
