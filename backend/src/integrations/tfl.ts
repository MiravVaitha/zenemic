import { env, features } from '../config/env';
import { logger } from '../config/logger';

export const tflEnabled = features.tfl;

export interface TflJourney {
  durationMinutes: number;
  summary: string; // e.g. "Victoria line + 8 min walk"
}

/**
 * Fastest public-transport journey to the venue via the TfL Journey Planner API.
 * `from`/`to` may be "lat,lng" pairs or place names. Returns null if TfL can't
 * plan it (e.g. outside London) — callers fall back to Google Maps transit.
 */
export async function getTflJourney(params: { from: string; to: string }): Promise<TflJourney | null> {
  if (!features.tfl) return null;
  const url = new URL(
    `https://api.tfl.gov.uk/Journey/JourneyResults/${encodeURIComponent(params.from)}/to/${encodeURIComponent(params.to)}`,
  );
  url.searchParams.set('app_key', env.TFL_APP_KEY as string);

  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      journeys?: Array<{
        duration: number;
        legs: Array<{ instruction?: { summary?: string } }>;
      }>;
    };
    const journey = data.journeys?.[0];
    if (!journey) return null;
    const summary = journey.legs
      .map((l) => l.instruction?.summary)
      .filter(Boolean)
      .slice(0, 3)
      .join(' → ');
    return { durationMinutes: journey.duration, summary: summary || 'Public transport route' };
  } catch (err) {
    logger.warn({ err }, 'TfL journey lookup failed');
    return null;
  }
}

/** Best-effort deep link into the TfL journey planner for the venue. */
export function tflJourneyPlannerLink(to: string): string {
  const url = new URL('https://tfl.gov.uk/plan-a-journey/results');
  url.searchParams.set('to', to);
  return url.toString();
}
