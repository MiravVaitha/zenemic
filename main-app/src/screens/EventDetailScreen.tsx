import React, { useCallback, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { FONTS, RADIUS, useTheme } from '../theme';
import { ZenChrome } from '../components/ZenChrome';
import { Section } from '../components/Section';
import { ZenText } from '../components/ZenText';
import { ZenStatusBadge } from '../components/ZenStatusBadge';
import { ChartTimeline } from '../components/ChartTimeline';
import { EventChatPanel } from '../components/EventChatPanel';
import { Spinner } from '../components/Spinner';
import {
  IconCalendar,
  IconChart,
  IconCheck,
  IconChevron,
  IconMoney,
  IconPhotos,
  IconPin,
  IconSpark,
} from '../icons';
import { api, ApiError } from '../lib/api';
import { useKeyboardInset } from '../lib/useKeyboardInset';
import type { EventDetail } from '../types/api';
import { ScreenProps } from '../navigation/types';

type ResourceId = 'chart' | 'cal' | 'split' | 'loc' | 'pix';

export function EventDetailScreen({ navigation, route }: ScreenProps<'EventDetail'>) {
  const t = useTheme();
  const base = route.params.event;
  const scrollRef = useRef<ScrollView>(null);
  const keyboardInset = useKeyboardInset();
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(() => {
    let alive = true;
    api
      .getEvent(base.id)
      .then((d) => alive && setDetail(d))
      .catch((e: ApiError) => alive && setNotice(e.message))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [base.id]);

  useFocusEffect(load);

  const ev = detail ?? base;
  const headcount = detail ? detail.attendees.length : base.attendees;
  const isOngoing = ev.kind === 'ongoing';
  const stages = detail?.stages ?? [];
  const locs = detail?.locations ?? [];

  const toggleStage = async (i: number) => {
    const s = stages[i];
    if (!s || !detail) return;
    const next = !s.done;
    setDetail({ ...detail, stages: detail.stages.map((x) => (x.id === s.id ? { ...x, done: next } : x)) });
    try {
      await api.setStageDone(base.id, s.id, next);
    } catch {
      setDetail((d) => (d ? { ...d, stages: d.stages.map((x) => (x.id === s.id ? { ...x, done: s.done } : x)) } : d));
    }
  };

  const openUrl = (url: string | null | undefined, fallbackMsg: string) => {
    if (url) Linking.openURL(url);
    else setNotice(fallbackMsg);
  };

  const calendar = detail?.resources.calendar ?? null;
  const resources: { id: ResourceId; label: string; meta: string; icon: React.ReactNode; onPress: () => void }[] = [
    { id: 'chart', label: 'Event planner chart', meta: `${stages.length || '—'} STAGES`, icon: <IconChart color={t.fg2} />, onPress: () => navigation.navigate('PlannerChart', { event: base }) },
    { id: 'cal', label: 'Calendar event', meta: calendar ? 'GOOGLE · SYNCED' : 'NOT CONNECTED', icon: <IconCalendar color={t.fg2} />, onPress: () => openUrl(calendar?.htmlLink, 'Connect Google Calendar in Settings to sync this event.') },
    { id: 'split', label: 'Payment splitter', meta: `${ev.budget ?? '—'} · ${headcount} WAYS`, icon: <IconMoney color={t.fg2} />, onPress: () => navigation.navigate('Splitter', { eventId: base.id, title: ev.title }) },
    { id: 'loc', label: 'Linked locations', meta: locs.length > 1 ? `${locs.length} STOPS` : 'MAPS', icon: <IconPin color={t.fg2} />, onPress: () => (locs.length > 1 ? navigation.navigate('EventLocations', { event: base }) : openUrl(locs[0]?.mapsUrl ?? detail?.resources.mapsUrl, 'No location link for this event yet.')) },
    { id: 'pix', label: 'Shared photo album', meta: 'OPEN', icon: <IconPhotos color={t.fg2} />, onPress: () => navigation.navigate('Album', { eventId: base.id, title: ev.title }) },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingBottom: keyboardInset }}>
      <ZenChrome
        label="EVENT DETAIL"
        onBack={() => navigation.goBack()}
        onMenu={() => navigation.navigate('EditEvent', { event: base })}
      />
      <ScrollView ref={scrollRef} contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Section paddingTop={24} gap={22}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <ZenStatusBadge kind={ev.kind} />
            <ZenText style={{ fontFamily: FONTS.mono, fontSize: 11, color: t.fg3, letterSpacing: 1.1 }}>
              {ev.date.toUpperCase()}
            </ZenText>
          </View>

          <View>
            <ZenText variant="h2">{ev.title}</ZenText>
            <View style={{ marginTop: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
              <Meta>{ev.time}</Meta>
              <Meta>·</Meta>
              <Meta>{ev.location}{locs.length > 1 ? ` +${locs.length - 1} more` : ''}</Meta>
              <Meta>·</Meta>
              <Meta>{headcount} GUESTS</Meta>
            </View>
          </View>

          {ev.msg ? (
            <View style={{ borderWidth: 0.5, borderColor: t.hairline, borderRadius: RADIUS.lg, padding: 16, backgroundColor: t.surface }}>
              <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 10 }}>ATTENDEE MESSAGE</ZenText>
              <ZenText style={{ color: t.fg, fontSize: 14.5, lineHeight: 21 }}>{ev.msg}</ZenText>
            </View>
          ) : null}

          {loading && !detail ? (
            <View style={{ paddingVertical: 30, alignItems: 'center' }}>
              <Spinner size={20} borderWidth={2} />
            </View>
          ) : (
            <>
              {isOngoing && stages.length > 0 ? (
                <View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <ZenText variant="eyebrow" tone="fg3">EVENT PLANNER CHART</ZenText>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <IconSpark color={t.accent} />
                      <ZenText style={{ fontFamily: FONTS.mono, fontSize: 10.5, letterSpacing: 1.47, color: t.fg3 }}>
                        {String(stages.filter((s) => s.done).length).padStart(2, '0')} / {String(stages.length).padStart(2, '0')} DONE
                      </ZenText>
                    </View>
                  </View>
                  <ChartTimeline stages={stages} done={stages.map((s) => s.done)} onToggle={toggleStage} />
                </View>
              ) : null}

              <View>
                <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 10 }}>AUTOMATED RESOURCES</ZenText>
                <View style={{ borderWidth: 0.5, borderColor: t.hairline, borderRadius: RADIUS.lg, backgroundColor: t.surface, overflow: 'hidden' }}>
                  {resources.map((r, i) => (
                    <Pressable
                      key={r.id}
                      onPress={r.onPress}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 14,
                        paddingHorizontal: 16,
                        paddingVertical: 14,
                        borderBottomWidth: i < resources.length - 1 ? 0.5 : 0,
                        borderBottomColor: t.hairline,
                      }}
                    >
                      <View style={{ width: 32, height: 32, borderRadius: RADIUS.sm, borderWidth: 0.5, borderColor: t.hairline, alignItems: 'center', justifyContent: 'center' }}>
                        {r.icon}
                      </View>
                      <View style={{ flex: 1, gap: 2 }}>
                        <ZenText style={{ fontSize: 15, color: t.fg }}>{r.label}</ZenText>
                        <ZenText style={{ fontFamily: FONTS.mono, fontSize: 10.5, letterSpacing: 1.47, color: t.fg3 }}>{r.meta}</ZenText>
                      </View>
                      <IconChevron color={t.fg3} />
                    </Pressable>
                  ))}
                </View>
                {notice ? <ZenText variant="body" tone="fg2" style={{ marginTop: 10 }}>{notice}</ZenText> : null}
              </View>

              <EventChatPanel event={base} onGrow={() => scrollRef.current?.scrollToEnd({ animated: true })} />
            </>
          )}
        </Section>
      </ScrollView>
    </View>
  );
}

function Meta({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return (
    <ZenText style={{ fontFamily: FONTS.mono, fontSize: 11, color: t.fg3, letterSpacing: 0.88, textTransform: 'uppercase' }}>
      {children}
    </ZenText>
  );
}
