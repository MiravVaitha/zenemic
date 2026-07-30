import React, { useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';
import { RADIUS, useTheme } from '../theme';
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
import { splitModeLabel } from '../lib/format';
import { useKeyboardInset } from '../lib/useKeyboardInset';
import type { EventDetail, SplitMode } from '../types/api';
import { ScreenProps } from '../navigation/types';

const SPLIT_CYCLE: SplitMode[] = ['EVEN', 'BY_SHARE', 'BY_ITEM'];

export function EditEventScreen({ navigation, route }: ScreenProps<'EditEvent'>) {
  const t = useTheme();
  const eventId = route.params.event.id;
  const keyboardInset = useKeyboardInset();

  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Editable fields, seeded once from the fetched detail. Fetch on mount only —
  // a focus refetch would clobber in-progress edits after a Splitter round-trip.
  const [title, setTitle] = useState('');
  const [locations, setLocations] = useState<LocationDraft[]>([]);
  const [attendees, setAttendees] = useState('');
  const [budget, setBudget] = useState('');
  const [splitMode, setSplitMode] = useState<SplitMode>('EVEN');
  const [when, setWhen] = useState<WhenValue>({
    dateLabel: '',
    timeLabel: '',
    startsAt: null,
    endsAt: null,
  });

  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { openPicker, sheetProps } = useDateTimePicker(when, setWhen);

  useEffect(() => {
    let alive = true;
    api
      .getEvent(eventId)
      .then((d) => {
        if (!alive) return;
        setDetail(d);
        setTitle(d.title);
        setLocations(toLocationDrafts(d.locations));
        setAttendees(String(d.attendees.length));
        setBudget(d.budget ?? '');
        setSplitMode(d.splitMode);
        setWhen({
          dateLabel: d.date,
          timeLabel: d.time,
          startsAt: d.startsAt ? new Date(d.startsAt) : null,
          endsAt: d.endsAt ? new Date(d.endsAt) : null,
        });
      })
      .catch((e: unknown) => alive && setLoadError(friendlyError(e, 'Couldn’t load this event.')))
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [eventId]);

  // Same rule as the backend's money guard: the host's share is PAID from
  // creation, so only a REQUESTED share or a non-host payment locks editing.
  const moneyLocked =
    detail?.split?.shares.some(
      (s) => s.status === 'REQUESTED' || (s.status === 'PAID' && !s.isHost),
    ) ?? false;

  const attendeeCount = parseInt(attendees, 10);
  const cleanLocations = fromLocationDrafts(locations);
  const invalidTitle = !title.trim();
  const invalidLocation = cleanLocations.length === 0;
  const invalidDate = !when.dateLabel.trim();
  const invalidTime = !when.timeLabel.trim();
  const invalidAttendees = !Number.isFinite(attendeeCount) || attendeeCount < 1;
  const invalidBudget = budget.trim() !== '' && !/\d/.test(budget);
  const hasInvalid =
    invalidTitle || invalidLocation || invalidDate || invalidTime || invalidAttendees || invalidBudget;

  /** Only the fields that differ from the loaded event go in the PATCH. */
  const buildPatch = (): Parameters<typeof api.updateEvent>[1] => {
    if (!detail) return {};
    const patch: Parameters<typeof api.updateEvent>[1] = {};
    if (title.trim() !== detail.title) patch.title = title.trim();
    const prevLocs = detail.locations.map((l) => ({ name: l.name, label: l.label, query: l.query }));
    if (JSON.stringify(cleanLocations) !== JSON.stringify(prevLocs)) patch.locations = cleanLocations;
    if (when.dateLabel.trim() !== detail.date) patch.dateLabel = when.dateLabel.trim();
    if (when.timeLabel.trim() !== detail.time) patch.timeLabel = when.timeLabel.trim();
    const startsISO = when.startsAt?.toISOString() ?? null;
    if (startsISO !== detail.startsAt) {
      patch.startsAtISO = startsISO;
      patch.endsAtISO = when.endsAt?.toISOString() ?? null;
    }
    if (Number.isFinite(attendeeCount) && attendeeCount !== detail.attendees.length) {
      patch.attendees = attendeeCount;
    }
    if (budget.trim() !== (detail.budget ?? '')) patch.budget = budget.trim() || null;
    if (splitMode !== detail.splitMode) patch.splitMode = splitMode;
    return patch;
  };

  const dirty = detail != null && Object.keys(buildPatch()).length > 0;
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  // Set before an intentional leave (save/delete) so beforeRemove lets it through.
  const leaveGuardRef = useRef(false);

  useEffect(() => {
    return navigation.addListener('beforeRemove', (e) => {
      if (leaveGuardRef.current || !dirtyRef.current) return;
      e.preventDefault();
      Alert.alert('Discard changes?', "Your edits haven't been saved.", [
        { text: 'Keep editing', style: 'cancel' },
        { text: 'Discard', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
      ]);
    });
  }, [navigation]);

  // The iOS swipe-back gesture can't be reliably intercepted by beforeRemove.
  useEffect(() => {
    navigation.setOptions({ gestureEnabled: !dirty });
  }, [navigation, dirty]);

  const cycleSplit = () =>
    setSplitMode((m) => SPLIT_CYCLE[(SPLIT_CYCLE.indexOf(m) + 1) % SPLIT_CYCLE.length]);

  const goSplitter = () =>
    navigation.navigate('Splitter', { eventId, title: detail?.title ?? route.params.event.title });

  const save = async () => {
    if (busy) return;
    if (hasInvalid) {
      setShowErrors(true);
      setError(null);
      return;
    }
    const patch = buildPatch();
    if (Object.keys(patch).length === 0) {
      leaveGuardRef.current = true;
      navigation.goBack();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.updateEvent(eventId, patch);
      leaveGuardRef.current = true;
      navigation.goBack(); // EventDetail refetches on focus
    } catch (e) {
      setError(friendlyError(e, 'Couldn’t save your changes.'));
      setBusy(false);
    }
  };

  const confirmDelete = () => {
    if (busy) return;
    Alert.alert(
      'Delete event',
      'This permanently deletes the event, its planner chart, payment split and album. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            setError(null);
            try {
              await api.deleteEvent(eventId);
              leaveGuardRef.current = true;
              // goBack would land on an EventDetail whose refetch 404s.
              navigation.reset({ index: 0, routes: [{ name: 'Events' }] });
            } catch (e) {
              setError(friendlyError(e, 'Couldn’t delete this event.'));
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingBottom: keyboardInset }}>
      <ZenChrome label="EVENT.EDIT" onBack={() => navigation.goBack()} showMenu={false} />
      {loading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <Spinner size={22} borderWidth={2} />
        </View>
      ) : loadError || !detail ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 }}>
          <ZenText variant="eyebrow" tone="fg3">COULDN&apos;T LOAD EVENT</ZenText>
          <ZenText variant="body" style={{ textAlign: 'center', maxWidth: 280 }}>
            {loadError ?? 'Something went wrong.'}
          </ZenText>
          <ZenButton label="Go back" variant="ghost" fullWidth={false} onPress={() => navigation.goBack()} />
        </View>
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            automaticallyAdjustKeyboardInsets
          >
            <Section paddingTop={28} gap={22}>
              <View>
                <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 12 }}>
                  {detail.title}
                </ZenText>
                <ZenText variant="h1">Update details</ZenText>
                <ZenText variant="body" style={{ marginTop: 12 }}>
                  Tap any field to change it. Calendar, maps and the splitter stay in sync.
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
                  value={title}
                  onChange={setTitle}
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
                  value={attendees}
                  onChange={setAttendees}
                  keyboardType="number-pad"
                  invalid={showErrors && invalidAttendees}
                  locked={moneyLocked}
                  onPress={moneyLocked ? goSplitter : undefined}
                />
                <EditableRow
                  label="Total budget"
                  value={budget}
                  onChange={setBudget}
                  invalid={showErrors && invalidBudget}
                  locked={moneyLocked}
                  onPress={moneyLocked ? goSplitter : undefined}
                />
                <EditableRow
                  label="Split mode"
                  value={splitModeLabel(splitMode)}
                  onPress={moneyLocked ? goSplitter : cycleSplit}
                  locked={moneyLocked}
                  isLast
                />
              </View>

              <View style={{ gap: 10 }}>
                <ZenText variant="eyebrow" tone="fg3">LOCATIONS</ZenText>
                <ZenText variant="body" tone="fg2" style={{ marginTop: -2 }}>
                  The first stop is the primary venue. Add more for multi-stop nights — the maps route and
                  planner chart follow the order.
                </ZenText>
                <LocationsEditor locations={locations} setLocations={setLocations} showErrors={showErrors} />
              </View>

              {moneyLocked ? (
                <ZenText variant="body" tone="fg2">
                  Payment requests are out — budget, attendees and split are managed in the splitter.
                </ZenText>
              ) : null}

              {error ? (
                <ZenText variant="body" style={{ color: t.danger }}>{error}</ZenText>
              ) : showErrors && hasInvalid ? (
                <ZenText variant="body" style={{ color: t.danger }}>Fill in the highlighted fields.</ZenText>
              ) : null}

              <ZenButton label="Delete event" variant="danger" style={{ marginTop: 8 }} onPress={confirmDelete} />
            </Section>
          </ScrollView>
          <Anchor>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ZenButton
                label="Cancel"
                variant={busy ? 'disabled' : 'ghost'}
                style={{ flex: 1 }}
                fullWidth={false}
                onPress={() => navigation.goBack()}
              />
              <ZenButton
                label={busy ? 'Saving…' : 'Save changes'}
                variant={busy ? 'disabled' : 'primary'}
                style={{ flex: 1 }}
                fullWidth={false}
                onPress={save}
              />
            </View>
          </Anchor>

          <DateTimePickerSheet {...sheetProps} />
        </>
      )}
    </View>
  );
}
