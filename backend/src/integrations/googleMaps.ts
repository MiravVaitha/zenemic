import { env, features } from '../config/env';
import { notConfigured } from '../lib/errors';
import { logger } from '../config/logger';

export const googleMapsEnabled = features.googleMaps;

export interface GeocodeResult {
  lat: number;
  lng: number;
  placeId: string;
  formattedAddress: string;
}

/** Resolve a place string to coordinates + place_id (Geocoding API). */
export async function geocode(query: string): Promise<GeocodeResult | null> {
  if (!features.googleMaps) throw notConfigured('Google Maps');
  const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
  url.searchParams.set('address', query);
  url.searchParams.set('key', env.GOOGLE_MAPS_API_KEY as string);

  const res = await fetch(url);
  const data = (await res.json()) as {
    status: string;
    results: Array<{
      geometry: { location: { lat: number; lng: number } };
      place_id: string;
      formatted_address: string;
    }>;
  };
  if (data.status !== 'OK' || !data.results.length) {
    logger.debug({ status: data.status, query }, 'geocode: no result');
    return null;
  }
  const r = data.results[0]!;
  return {
    lat: r.geometry.location.lat,
    lng: r.geometry.location.lng,
    placeId: r.place_id,
    formattedAddress: r.formatted_address,
  };
}

/**
 * Build a Google Maps directions deep link to the venue. This is a universal
 * URL (no API key needed) the client can open directly.
 */
export function directionsLink(params: { destination: string; placeId?: string | null }): string {
  const url = new URL('https://www.google.com/maps/dir/');
  url.searchParams.set('api', '1');
  url.searchParams.set('destination', params.destination);
  if (params.placeId) url.searchParams.set('destination_place_id', params.placeId);
  return url.toString();
}

export type TravelMode = 'driving' | 'walking' | 'bicycling' | 'transit';

export interface TravelEstimate {
  mode: TravelMode;
  durationText: string;
  distanceText: string;
}

/** Travel time/distance to the venue from an origin (Directions API). */
export async function getTravelEstimate(params: {
  origin: string;
  destination: string;
  mode?: TravelMode;
}): Promise<TravelEstimate | null> {
  if (!features.googleMaps) throw notConfigured('Google Maps');
  const mode = params.mode ?? 'driving';
  const url = new URL('https://maps.googleapis.com/maps/api/directions/json');
  url.searchParams.set('origin', params.origin);
  url.searchParams.set('destination', params.destination);
  url.searchParams.set('mode', mode);
  url.searchParams.set('key', env.GOOGLE_MAPS_API_KEY as string);

  const res = await fetch(url);
  const data = (await res.json()) as {
    status: string;
    routes: Array<{ legs: Array<{ duration: { text: string }; distance: { text: string } }> }>;
  };
  const leg = data.routes[0]?.legs[0];
  if (data.status !== 'OK' || !leg) return null;
  return { mode, durationText: leg.duration.text, distanceText: leg.distance.text };
}
