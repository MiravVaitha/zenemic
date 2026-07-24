import React, { useEffect, useRef, useState } from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, View } from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { FONTS, RADIUS, useTheme } from '../theme';
import { ZenChrome } from '../components/ZenChrome';
import { Section, Anchor } from '../components/Section';
import { ZenText } from '../components/ZenText';
import { ZenButton } from '../components/ZenButton';
import { EditableRow } from '../components/EditableRow';
import {
  LocationsEditor,
  toLocationDrafts,
  fromLocationDrafts,
  type LocationDraft,
} from '../components/LocationsEditor';
import { Spinner } from '../components/Spinner';
import { api, ApiError } from '../lib/api';
import { formatDateLabel, formatTimeLabel, parseLabelsToDate, splitModeLabel } from '../lib/format';
import { useKeyboardInset } from '../lib/useKeyboardInset';
import type { EventDetail, SplitMode } from '../types/api';
import { ScreenProps } from '../navigation/types';

const SPLIT_CYCLE: SplitMode[] = ['EVEN', 'BY_SHARE', 'BY_ITEM'];
const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

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
  const [startsAt, setStartsAt] = useState<Date | null>(null);
  const [endsAt, setEndsAt] = useState<Date | null>(null);
  const [dateLabel, setDateLabel] = useState('');
  const [timeLabel, setTimeLabel] = useState('');

  const [busy, setBusy] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [iosPicker, setIosPicker] = useState<'date' | 'time' | null>(null);
  // iOS commits on "Done"; hold the in-progress wheel value so Cancel can drop it.
  const [pickerTemp, setPickerTemp] = useState<Date>(() => new Date());

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
        setStartsAt(d.startsAt ? new Date(d.startsAt) : null);
        setEndsAt(d.endsAt ? new Date(d.endsAt) : null);
        setDateLabel(d.date);
        setTimeLabel(d.time);
      })
      .catch((e: ApiError) => alive && setLoadError(e.message))
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
  const invalidDate = !dateLabel.trim();
  const invalidTime = !timeLabel.trim();
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
    if (dateLabel.trim() !== detail.date) patch.dateLabel = dateLabel.trim();
    if (timeLabel.trim() !== detail.time) patch.timeLabel = timeLabel.trim();
    const startsISO = startsAt?.toISOString() ?? null;
    if (startsISO !== detail.startsAt) {
      patch.startsAtISO = startsISO;
      patch.endsAtISO = endsAt?.toISOString() ?? null;
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

  // Open the picker at whatever the row currently shows (parsed from the
  // labels), so it never jumps to an unrelated default or a tz-shifted instant.
  const baseDate = () => {
    const parsed = parseLabelsToDate(dateLabel, timeLabel);
    if (parsed) return parsed;
    if (startsAt) return startsAt;
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(19, 0, 0, 0); // nothing to parse — start from tomorrow evening
    return d;
  };

  const applyStart = (d: Date) => {
    const durationMs =
      startsAt && endsAt && endsAt.getTime() > startsAt.getTime()
        ? endsAt.getTime() - startsAt.getTime()
        : TWO_HOURS_MS;
    setStartsAt(d);
    setEndsAt(new Date(d.getTime() + durationMs)); // preserve the event's duration
    setDateLabel(formatDateLabel(d));
    setTimeLabel(formatTimeLabel(d));
  };

  const openPicker = (mode: 'date' | 'time') => {
    const base = baseDate();
    if (Platform.OS === 'android') {
      // System dialog; date mode keeps the time-of-day from `value`, time mode keeps the date.
      DateTimePickerAndroid.open({
        value: base,
        mode,
        onChange: (event, d) => {
          if (event.type === 'set' && d) applyStart(d);
        },
      });
    } else {
      setPickerTemp(base);
      setIosPicker(mode);
    }
  };

  const confirmIosPicker = () => {
    applyStart(pickerTemp);
    setIosPicker(null);
  };

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
      setError((e as ApiError).message);
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
              setError((e as ApiError).message);
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
                  value={dateLabel}
                  onPress={() => openPicker('date')}
                  invalid={showErrors && invalidDate}
                />
                <EditableRow
                  label="Time"
                  value={timeLabel}
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

          {/* iOS: an overlay sheet (Android uses the self-dismissing system dialog).
              Overlaying instead of inlining keeps the Delete button in place. */}
          <Modal
            visible={iosPicker !== null}
            transparent
            animationType="slide"
            onRequestClose={() => setIosPicker(null)}
          >
            <Pressable
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
              onPress={() => setIosPicker(null)}
            >
              <Pressable
                onPress={() => {}}
                style={{
                  backgroundColor: t.surface,
                  borderTopLeftRadius: RADIUS.lg,
                  borderTopRightRadius: RADIUS.lg,
                  paddingBottom: 12,
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 16,
                    paddingVertical: 12,
                    borderBottomWidth: 0.5,
                    borderBottomColor: t.hairline,
                  }}
                >
                  <Pressable onPress={() => setIosPicker(null)} hitSlop={8}>
                    <ZenText style={{ fontFamily: FONTS.mono, fontSize: 11, letterSpacing: 1.2, color: t.fg3 }}>
                      CANCEL
                    </ZenText>
                  </Pressable>
                  <ZenText variant="eyebrow" tone="fg3">
                    {iosPicker === 'time' ? 'PICK TIME' : 'PICK DATE'}
                  </ZenText>
                  <Pressable onPress={confirmIosPicker} hitSlop={8}>
                    <ZenText style={{ fontFamily: FONTS.mono, fontSize: 11, letterSpacing: 1.2, color: t.accent }}>
                      DONE
                    </ZenText>
                  </Pressable>
                </View>
                <DateTimePicker
                  value={pickerTemp}
                  mode={iosPicker === 'time' ? 'time' : 'date'}
                  display="spinner"
                  themeVariant={t.mode}
                  onChange={(_e, d) => d && setPickerTemp(d)}
                  style={{ backgroundColor: t.surface }}
                />
              </Pressable>
            </Pressable>
          </Modal>
        </>
      )}
    </View>
  );
}
