import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
import { FONTS, RADIUS, useTheme } from '../theme';
import { ZenChrome } from '../components/ZenChrome';
import { Section, Anchor } from '../components/Section';
import { ZenText } from '../components/ZenText';
import { ZenButton } from '../components/ZenButton';
import { EditableRow } from '../components/EditableRow';
import {
  useDateTimePicker,
  DateTimePickerSheet,
  type WhenValue,
} from '../components/DateTimePickerSheet';
import {
  LocationsEditor,
  toLocationDrafts,
  fromLocationDrafts,
  type LocationDraft,
} from '../components/LocationsEditor';
import { Spinner } from '../components/Spinner';
import { api } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { formatBudget, splitModeLabel } from '../lib/format';
import { useKeyboardInset } from '../lib/useKeyboardInset';
import { useDraft } from '../navigation/DraftContext';
import type { Features, SplitMode } from '../types/api';
import { ScreenProps } from '../navigation/types';

const SPLIT_CYCLE: SplitMode[] = ['EVEN', 'BY_SHARE', 'BY_ITEM'];

type Fields = {
  title: string;
  attendees: string;
  budget: string;
};

const EMPTY_FIELDS: Fields = { title: '', attendees: '', budget: '' };
const EMPTY_WHEN: WhenValue = { dateLabel: '', timeLabel: '', startsAt: null, endsAt: null };

export function CreateConfirmScreen({ navigation }: ScreenProps<'CreateConfirm'>) {
  const t = useTheme();
  const { draft, setDraft } = useDraft();
  const keyboardInset = useKeyboardInset();

  const [fields, setFields] = useState<Fields>(() =>
    draft.fields
      ? { title: draft.fields.title, attendees: draft.fields.attendees, budget: draft.fields.budget }
      : EMPTY_FIELDS,
  );
  const [when, setWhen] = useState<WhenValue>(() =>
    draft.fields
      ? {
          dateLabel: draft.fields.date,
          timeLabel: draft.fields.time,
          startsAt: draft.startsAt ?? null,
          endsAt: draft.endsAt ?? null,
        }
      : EMPTY_WHEN,
  );
  const [splitMode, setSplitMode] = useState<SplitMode>(draft.extracted?.splitMode ?? 'EVEN');
  const [locations, setLocations] = useState<LocationDraft[]>(
    draft.locations ? toLocationDrafts(draft.locations) : [],
  );
  const [showErrors, setShowErrors] = useState(false);
  const [extracting, setExtracting] = useState(!draft.fields);
  const [error, setError] = useState<string | null>(null);
  const [features, setFeatures] = useState<Features | null>(null);
  const [calendarConnected, setCalendarConnected] = useState(false);

  const { openPicker, sheetProps } = useDateTimePicker(when, setWhen);

  useEffect(() => {
    if (draft.fields) return; // already extracted/edited — keep the user's values
    let alive = true;
    setExtracting(true);
    setError(null);
    api
      .draftEvent(draft.message ?? '')
      .then((ex) => {
        if (!alive) return;
        // A null date / time / location means the message didn't say. Leave the
        // row empty so the host fills it in — the whole point of asking rather
        // than shipping whatever the model guessed.
        const nextFields: Fields = {
          title: ex.title,
          attendees: String(ex.attendees),
          budget: formatBudget(ex.budgetMajor, ex.currency),
        };
        const nextWhen: WhenValue = {
          dateLabel: ex.dateLabel ?? '',
          timeLabel: ex.timeLabel ?? '',
          startsAt: ex.startsAtISO ? new Date(ex.startsAtISO) : null,
          endsAt: ex.endsAtISO ? new Date(ex.endsAtISO) : null,
        };
        const locs = toLocationDrafts(ex.locations ?? []);
        setFields(nextFields);
        setWhen(nextWhen);
        setSplitMode(ex.splitMode);
        setLocations(locs);
        setDraft({
          ...draft,
          extracted: ex,
          fields: {
            ...nextFields,
            date: nextWhen.dateLabel,
            time: nextWhen.timeLabel,
            splitMode: splitModeLabel(ex.splitMode),
          },
          startsAt: nextWhen.startsAt,
          endsAt: nextWhen.endsAt,
          locations: fromLocationDrafts(locs),
        });
        setExtracting(false);
      })
      .catch((e: unknown) => {
        if (!alive) return;
        setError(friendlyError(e, 'Couldn’t read those details. Try rewording them.'));
        setExtracting(false);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Which resources are actually possible, so the "will generate" list doesn't
  // promise a calendar event to someone who hasn't connected Google. Best-effort:
  // a feature we couldn't confirm simply isn't promised.
  useEffect(() => {
    let alive = true;
    api
      .integrationsStatus()
      .then(({ features: f }) => alive && setFeatures(f))
      .catch(() => {});
    api
      .getMe()
      .then((p) => alive && setCalendarConnected(p.googleCalendarConnected))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const update = (k: keyof Fields, v: string) => setFields((f) => ({ ...f, [k]: v }));

  const cleanLocations = fromLocationDrafts(locations);
  const attendeeCount = parseInt(fields.attendees, 10);
  const invalidTitle = !fields.title.trim();
  const invalidDate = !when.dateLabel.trim();
  const invalidTime = !when.timeLabel.trim();
  const invalidAttendees = !Number.isFinite(attendeeCount) || attendeeCount < 1;
  const invalidBudget = fields.budget.trim() !== '' && !/\d/.test(fields.budget);
  const invalidLocation = cleanLocations.length === 0;
  const hasInvalid =
    invalidTitle || invalidDate || invalidTime || invalidAttendees || invalidBudget || invalidLocation;

  if (extracting) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ZenChrome label="EVENT.CREATE" onBack={() => navigation.goBack()} progress={2} total={4} showMenu={false} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 14 }}>
          <Spinner size={24} borderWidth={2} />
          <ZenText variant="eyebrow" tone="fg3">READING MESSAGE</ZenText>
          <ZenText variant="body" style={{ textAlign: 'center', maxWidth: 280 }}>
            Zenemic AI is pulling out the event details…
          </ZenText>
        </View>
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <ZenChrome label="EVENT.CREATE" onBack={() => navigation.goBack()} progress={2} total={4} showMenu={false} />
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
          <ZenText variant="eyebrow" tone="fg3">EXTRACTION FAILED</ZenText>
          <ZenText variant="body" style={{ textAlign: 'center', maxWidth: 280 }}>{error}</ZenText>
          <ZenButton label="Go back" variant="ghost" fullWidth={false} onPress={() => navigation.goBack()} />
        </View>
      </View>
    );
  }

  // Only promise what this event and this server can actually produce — the same
  // preconditions the backend's generateResources applies.
  const willGenerate = [
    { tag: 'Planner chart', on: true },
    {
      tag: 'Calendar event',
      on: Boolean(features?.googleCalendar) && calendarConnected && when.startsAt != null,
    },
    { tag: 'Payment splitter', on: /\d/.test(fields.budget) && attendeeCount > 1 },
    { tag: 'Location links', on: cleanLocations.length > 0 },
    { tag: 'Shared album', on: Boolean(features?.storage) },
  ].filter((r) => r.on);

  const anythingMissing = invalidDate || invalidTime || invalidLocation;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingBottom: keyboardInset }}>
      <ZenChrome label="EVENT.CREATE" onBack={() => navigation.goBack()} progress={2} total={4} showMenu={false} />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Section paddingTop={28} gap={22}>
          <View>
            <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 12 }}>CONFIRM · 02 / 04</ZenText>
            <ZenText variant="h1">Look right?</ZenText>
            <ZenText variant="body" style={{ marginTop: 12 }}>
              {anythingMissing
                ? 'Your message didn’t say everything — fill in the highlighted fields and change anything else that’s off.'
                : 'Tap any field to edit before we set things up.'}
            </ZenText>
          </View>

          <View
            style={{
              borderWidth: 0.5,
              borderColor: t.hairline,
              borderRadius: RADIUS.lg,
              backgroundColor: t.surface,
              overflow: 'hidden',
            }}
          >
            <EditableRow
              label="Event title"
              value={fields.title}
              onChange={(v) => update('title', v)}
              invalid={showErrors && invalidTitle}
            />
            <EditableRow
              label="Date"
              value={when.dateLabel}
              placeholder="Tap to pick a date"
              onPress={() => openPicker('date')}
              invalid={showErrors && invalidDate}
            />
            <EditableRow
              label="Time"
              value={when.timeLabel}
              placeholder="Tap to pick a time"
              onPress={() => openPicker('time')}
              invalid={showErrors && invalidTime}
            />
            <EditableRow
              label="Attendees"
              value={fields.attendees}
              onChange={(v) => update('attendees', v)}
              keyboardType="number-pad"
              invalid={showErrors && invalidAttendees}
            />
            <EditableRow
              label="Total budget"
              value={fields.budget}
              placeholder="Optional"
              onChange={(v) => update('budget', v)}
              invalid={showErrors && invalidBudget}
            />
            <EditableRow
              label="Split mode"
              value={splitModeLabel(splitMode)}
              onPress={() =>
                setSplitMode((m) => SPLIT_CYCLE[(SPLIT_CYCLE.indexOf(m) + 1) % SPLIT_CYCLE.length])
              }
              isLast
            />
          </View>

          <View style={{ gap: 10 }}>
            <ZenText variant="eyebrow" tone="fg3">LOCATIONS</ZenText>
            <LocationsEditor locations={locations} setLocations={setLocations} showErrors={showErrors} />
          </View>

          {willGenerate.length ? (
            <View>
              <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 8 }}>WILL GENERATE</ZenText>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {willGenerate.map(({ tag }) => (
                  <View
                    key={tag}
                    style={{
                      paddingHorizontal: 10,
                      paddingVertical: 6,
                      borderWidth: 0.5,
                      borderColor: t.hairline,
                      borderRadius: RADIUS.pill,
                    }}
                  >
                    <ZenText
                      style={{
                        fontFamily: FONTS.mono,
                        fontSize: 10.5,
                        letterSpacing: 1.47,
                        textTransform: 'uppercase',
                        color: t.fg2,
                      }}
                    >
                      {tag}
                    </ZenText>
                  </View>
                ))}
              </View>
            </View>
          ) : null}

          {showErrors && hasInvalid ? (
            <ZenText variant="body" style={{ color: t.danger }}>Fill in the highlighted fields.</ZenText>
          ) : null}
        </Section>
      </ScrollView>
      <Anchor>
        <ZenButton
          label="Looks right · Create"
          variant="primary"
          trailingArrow
          onPress={() => {
            if (hasInvalid) {
              setShowErrors(true);
              return;
            }
            setDraft({
              ...draft,
              fields: {
                title: fields.title.trim(),
                date: when.dateLabel.trim(),
                time: when.timeLabel.trim(),
                attendees: fields.attendees,
                budget: fields.budget,
                splitMode: splitModeLabel(splitMode),
              },
              startsAt: when.startsAt,
              endsAt: when.endsAt,
              locations: cleanLocations,
            });
            navigation.navigate('CreateProcessing');
          }}
        />
      </Anchor>
      <DateTimePickerSheet {...sheetProps} />
    </View>
  );
}
