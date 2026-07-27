import React, { useCallback, useState } from 'react';
import { Image, Linking, Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FONTS, RADIUS, useTheme } from '../theme';
import { ZenChrome } from '../components/ZenChrome';
import { Section, Anchor } from '../components/Section';
import { ZenText } from '../components/ZenText';
import { ZenButton } from '../components/ZenButton';
import { Spinner } from '../components/Spinner';
import { IconChevron } from '../icons';
import { api } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { config } from '../config';
import { useKeyboardInset } from '../lib/useKeyboardInset';
import type { EventDetail, EventLocation } from '../types/api';
import { ScreenProps } from '../navigation/types';

/**
 * The multi-stop hub, reached from EventDetail's "Linked locations" row when an
 * event has more than one stop. Shows a static map with numbered pins, a list of
 * stops (tap one to open it in Google Maps), and a "Route through all stops"
 * button (the whole journey in Maps).
 */
export function EventLocationsScreen({ navigation, route }: ScreenProps<'EventLocations'>) {
  const t = useTheme();
  const base = route.params.event;
  const keyboardInset = useKeyboardInset();
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  // The static map is best-effort — hide it if the image fails to load (e.g. the
  // Static Maps API isn't enabled, or a transient/network error).
  const [mapFailed, setMapFailed] = useState(false);

  const load = useCallback(() => {
    let alive = true;
    api
      .getEvent(base.id)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setMapFailed(false);
      })
      .catch((e: unknown) => alive && setNotice(friendlyError(e, 'Couldn’t load the locations.')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [base.id]);

  useFocusEffect(load);

  const locations = detail?.locations ?? [];
  const routeUrl = detail?.resources.routeUrl ?? null;
  const mapImageUrl = detail?.resources.mapImageUrl ?? null;

  const open = (url: string | null | undefined, msg: string) => {
    if (url) Linking.openURL(url);
    else setNotice(msg);
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingBottom: keyboardInset }}>
      <ZenChrome label="LOCATIONS" onBack={() => navigation.goBack()} showMenu={false} />
      {loading && !detail ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={22} borderWidth={2} />
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
            <Section paddingTop={22} gap={20}>
              <View>
                <ZenText variant="eyebrow" tone="fg3">{base.title.toUpperCase()}</ZenText>
                <ZenText variant="h2" style={{ marginTop: 4 }}>
                  {locations.length} {locations.length === 1 ? 'location' : 'locations'}
                </ZenText>
              </View>

              {mapImageUrl && !mapFailed ? (
                <Pressable onPress={() => open(routeUrl ?? locations[0]?.mapsUrl, 'No map link yet.')}>
                  <Image
                    source={{ uri: `${config.apiUrl}/api${mapImageUrl}` }}
                    resizeMode="cover"
                    onError={() => setMapFailed(true)}
                    style={{
                      width: '100%',
                      aspectRatio: 16 / 9,
                      borderRadius: RADIUS.lg,
                      borderWidth: 0.5,
                      borderColor: t.hairline,
                      backgroundColor: t.surface,
                    }}
                  />
                </Pressable>
              ) : null}

              <View
                style={{
                  borderWidth: 0.5,
                  borderColor: t.hairline,
                  borderRadius: RADIUS.lg,
                  backgroundColor: t.surface,
                  overflow: 'hidden',
                }}
              >
                {locations.map((loc, i) => (
                  <LocationRow
                    key={loc.id}
                    loc={loc}
                    index={i}
                    isLast={i === locations.length - 1}
                    onPress={() => open(loc.mapsUrl, 'No map link for this stop yet.')}
                  />
                ))}
              </View>

              {notice ? (
                <ZenText variant="body" tone="fg2">{notice}</ZenText>
              ) : null}
            </Section>
          </ScrollView>
          {routeUrl ? (
            <Anchor>
              <ZenButton
                label="Route through all stops"
                variant="primary"
                trailingArrow
                onPress={() => open(routeUrl, 'No route link yet.')}
              />
            </Anchor>
          ) : null}
        </>
      )}
    </View>
  );
}

function LocationRow({
  loc,
  index,
  isLast,
  onPress,
}: {
  loc: EventLocation;
  index: number;
  isLast: boolean;
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 0.5,
        borderBottomColor: t.hairline,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: RADIUS.sm,
          borderWidth: 0.5,
          borderColor: t.hairline,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Number matches the numbered pins on the static map above. */}
        <ZenText style={{ fontFamily: FONTS.mono, fontSize: 13, color: t.fg2 }}>{index + 1}</ZenText>
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <ZenText style={{ fontSize: 15, color: t.fg }}>{loc.name}</ZenText>
        <ZenText style={{ fontFamily: FONTS.mono, fontSize: 10.5, letterSpacing: 1.47, color: t.fg3 }}>
          {(loc.label ? `${loc.label.toUpperCase()} · ` : '') + 'OPEN IN MAPS'}
        </ZenText>
      </View>
      <IconChevron color={t.fg3} />
    </Pressable>
  );
}
