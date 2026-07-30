import React, { useEffect, useRef, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FONTS, RADIUS, useTheme } from '../theme';
import { ZenChrome } from '../components/ZenChrome';
import { Section, Anchor } from '../components/Section';
import { ZenText } from '../components/ZenText';
import { ZenButton } from '../components/ZenButton';
import { Spinner } from '../components/Spinner';
import { IconCheck } from '../icons';
import { api } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { splitModeEnum } from '../lib/format';
import { useDraft } from '../navigation/DraftContext';
import type { CreateEventInput, ResourceKey, ResourceReport } from '../types/api';
import { ScreenProps } from '../navigation/types';

/** The five automated resources, in the order the backend reports them. */
const RESOURCES: { key: ResourceKey; label: string }[] = [
  { key: 'chart', label: 'Event planner chart' },
  { key: 'calendar', label: 'Calendar event' },
  { key: 'splitter', label: 'Payment splitter' },
  { key: 'locations', label: 'Linked locations · Maps' },
  { key: 'album', label: 'Shared photo album' },
];

/** How long the finished rows stay on screen before advancing, when all five landed. */
const SETTLE_MS = 900;

export function CreateProcessingScreen({ navigation }: ScreenProps<'CreateProcessing'>) {
  const t = useTheme();
  const { draft, setDraft } = useDraft();
  const [report, setReport] = useState<ResourceReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  // The back chevron is hidden, but the native swipe-back isn't — without this,
  // swiping mid-request and pressing Create again fires a second POST /events.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: false });
  }, [navigation]);

  // Fire the real POST /events once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const f = draft.fields;
    const ex = draft.extracted;
    if (!f) {
      setError('Missing event details. Go back and describe your event again.');
      return;
    }
    const input: CreateEventInput = {
      title: f.title,
      dateLabel: f.date,
      timeLabel: f.time,
      locations: draft.locations ?? [],
      attendees: Math.max(1, parseInt(f.attendees, 10) || 1),
      guests: ex?.guests ?? [],
      budget: f.budget || null,
      currency: ex?.currency,
      splitMode: splitModeEnum(f.splitMode),
      // The instants confirmed on the previous screen — NOT the raw extraction.
      // A date the host corrected has to reach the calendar and the planned /
      // ongoing / previous bucket, not just the label.
      startsAtISO: draft.startsAt?.toISOString() ?? null,
      endsAtISO: draft.endsAt?.toISOString() ?? null,
      sourceMessage: draft.message ?? null,
    };
    api
      .createEvent(input)
      .then(({ event, resources }) => {
        setReport(resources);
        setDraft({ ...draft, created: event, report: resources });
      })
      .catch((e: unknown) => setError(friendlyError(e, 'Couldn’t create your event.')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Everything worked — nothing to read, so move on. When something was skipped
  // or failed, stop and let the host actually see it.
  const allCreated = report != null && RESOURCES.every((r) => report[r.key].status === 'created');
  useEffect(() => {
    if (!allCreated) return;
    const id = setTimeout(() => navigation.replace('CreateSuccess'), SETTLE_MS);
    return () => clearTimeout(id);
  }, [allCreated, navigation]);

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ZenChrome label="EVENT.CREATE" progress={3} total={4} showMenu={false} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
          <ZenText variant="eyebrow" tone="fg3">COULDN'T CREATE EVENT</ZenText>
          <ZenText variant="body" style={{ textAlign: 'center', maxWidth: 280 }}>{error}</ZenText>
          <ZenButton label="Go back" variant="ghost" fullWidth={false} onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  const settled = report != null;
  const notDone = settled ? RESOURCES.filter((r) => report[r.key].status !== 'created').length : 0;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ZenChrome label="EVENT.CREATE" progress={3} total={4} showMenu={false} />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <Section paddingTop={28} gap={24}>
          <View>
            <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 12 }}>PROCESSING · 03 / 04</ZenText>
            <ZenText variant="h1">
              {settled ? `Event created.` : `Setting up\nyour event…`}
            </ZenText>
            {settled && notDone > 0 ? (
              <ZenText variant="body" style={{ marginTop: 12 }}>
                {notDone === 1 ? 'One thing needs' : `${notDone} things need`} your input — everything
                else is ready.
              </ZenText>
            ) : null}
          </View>

          <View style={{ gap: 8 }}>
            <ZenText variant="eyebrow" tone="fg3">AUTOMATED RESOURCES</ZenText>
            <View
              style={{
                borderWidth: 0.5,
                borderColor: t.hairline,
                borderRadius: RADIUS.lg,
                backgroundColor: t.surface,
                overflow: 'hidden',
              }}
            >
              {RESOURCES.map((r, i) => (
                <ResourceRow
                  key={r.key}
                  label={r.label}
                  outcome={report?.[r.key] ?? null}
                  isLast={i === RESOURCES.length - 1}
                />
              ))}
            </View>
          </View>
        </Section>
      </ScrollView>
      {settled && notDone > 0 ? (
        <Anchor>
          <ZenButton
            label="Continue"
            variant="primary"
            trailingArrow
            onPress={() => navigation.replace('CreateSuccess')}
          />
        </Anchor>
      ) : null}
    </View>
  );
}

/** One resource: pending while the request is out, then its real outcome. */
function ResourceRow({
  label,
  outcome,
  isLast,
}: {
  label: string;
  outcome: { status: 'created' | 'skipped' | 'failed'; reason?: string } | null;
  isLast: boolean;
}) {
  const t = useTheme();
  const status = outcome?.status;
  const meta = outcome == null ? 'RUNNING' : status === 'created' ? 'DONE' : status === 'skipped' ? 'SKIPPED' : 'FAILED';
  const metaColor = outcome == null ? t.fg3 : status === 'created' ? t.accent : status === 'failed' ? t.danger : t.fg3;

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 14,
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: isLast ? 0 : 0.5,
        borderBottomColor: t.hairline,
      }}
    >
      <View style={{ paddingTop: 1 }}>
        <StatusIcon status={status} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <ZenText style={{ fontSize: 15, color: status && status !== 'created' ? t.fg2 : t.fg }}>
          {label}
        </ZenText>
        {/* Reasons are written for the host by the backend, so they render as-is. */}
        {outcome?.reason ? (
          <ZenText variant="body" tone="fg3" style={{ fontSize: 13 }}>{outcome.reason}</ZenText>
        ) : null}
      </View>
      <ZenText
        style={{
          fontFamily: FONTS.mono,
          fontSize: 10,
          letterSpacing: 1.6,
          textTransform: 'uppercase',
          color: metaColor,
          paddingTop: 3,
        }}
      >
        {meta}
      </ZenText>
    </View>
  );
}

function StatusIcon({ status }: { status?: 'created' | 'skipped' | 'failed' }) {
  const t = useTheme();
  if (status === 'created') {
    return (
      <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
        <IconCheck color="#0a0a0a" />
      </View>
    );
  }
  if (status === undefined) {
    return (
      <View style={{ width: 22, height: 22, alignItems: 'center', justifyContent: 'center' }}>
        <Spinner />
      </View>
    );
  }
  // Skipped / failed: an outlined ring, so it reads as "not there" rather than
  // "in progress" — the state the old fixed checklist could never show.
  return (
    <View
      style={{
        width: 22,
        height: 22,
        borderRadius: 11,
        borderWidth: 0.5,
        borderColor: status === 'failed' ? t.danger : t.hairline,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <View
        style={{
          width: 8,
          height: 1.5,
          borderRadius: 1,
          backgroundColor: status === 'failed' ? t.danger : t.fg3,
        }}
      />
    </View>
  );
}
