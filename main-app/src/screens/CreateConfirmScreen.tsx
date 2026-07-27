import React, { useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';
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
import { api } from '../lib/api';
import { friendlyError } from '../lib/errors';
import { formatBudget, splitModeLabel } from '../lib/format';
import { useKeyboardInset } from '../lib/useKeyboardInset';
import { useDraft } from '../navigation/DraftContext';
import { ScreenProps } from '../navigation/types';

type Fields = {
  title: string;
  date: string;
  time: string;
  attendees: string;
  budget: string;
  splitMode: string;
};

const EMPTY: Fields = { title: '', date: '', time: '', attendees: '', budget: '', splitMode: 'Even split' };

export function CreateConfirmScreen({ navigation }: ScreenProps<'CreateConfirm'>) {
  const t = useTheme();
  const { draft, setDraft } = useDraft();
  const keyboardInset = useKeyboardInset();
  const [fields, setFields] = useState<Fields>(draft.fields ?? EMPTY);
  const [locations, setLocations] = useState<LocationDraft[]>(
    draft.locations ? toLocationDrafts(draft.locations) : [],
  );
  const [showLocErr, setShowLocErr] = useState(false);
  const [extracting, setExtracting] = useState(!draft.fields);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (draft.fields) return; // already extracted/edited — keep the user's values
    let alive = true;
    setExtracting(true);
    setError(null);
    api
      .draftEvent(draft.message ?? '')
      .then((ex) => {
        if (!alive) return;
        const next: Fields = {
          title: ex.title,
          date: ex.dateLabel,
          time: ex.timeLabel,
          attendees: String(ex.attendees),
          budget: formatBudget(ex.budgetMajor, ex.currency),
          splitMode: splitModeLabel(ex.splitMode),
        };
        const locs = toLocationDrafts(ex.locations);
        setFields(next);
        setLocations(locs);
        setDraft({ ...draft, extracted: ex, fields: next, locations: fromLocationDrafts(locs) });
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

  const update = (k: keyof Fields, v: string) => setFields((f) => ({ ...f, [k]: v }));

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

  const rows: { key: keyof typeof fields; label: string }[] = [
    { key: 'title', label: 'Event title' },
    { key: 'date', label: 'Date' },
    { key: 'time', label: 'Time' },
    { key: 'attendees', label: 'Attendees' },
    { key: 'budget', label: 'Total budget' },
    { key: 'splitMode', label: 'Split mode' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingBottom: keyboardInset }}>
      <ZenChrome label="EVENT.CREATE" onBack={() => navigation.goBack()} progress={2} total={4} showMenu={false} />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        <Section paddingTop={28} gap={22}>
          <View>
            <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 12 }}>CONFIRM · 02 / 04</ZenText>
            <ZenText variant="h1">Look right?</ZenText>
            <ZenText variant="body" style={{ marginTop: 12 }}>
              Tap any field to edit before we set things up.
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
            {rows.map((r, i) => (
              <EditableRow
                key={r.key}
                label={r.label}
                value={fields[r.key]}
                onChange={(v) => update(r.key, v)}
                isLast={i === rows.length - 1}
              />
            ))}
          </View>

          <View style={{ gap: 10 }}>
            <ZenText variant="eyebrow" tone="fg3">LOCATIONS</ZenText>
            <LocationsEditor locations={locations} setLocations={setLocations} showErrors={showLocErr} />
          </View>

          <View>
            <ZenText variant="eyebrow" tone="fg3" style={{ marginBottom: 8 }}>WILL GENERATE</ZenText>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {['Planner chart', 'Calendar event', 'Payment splitter', 'Location links', 'Shared album'].map((tag) => (
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
        </Section>
      </ScrollView>
      <Anchor>
        <ZenButton
          label="Looks right · Create"
          variant="primary"
          trailingArrow
          onPress={() => {
            const locs = fromLocationDrafts(locations);
            if (!locs.length) {
              setShowLocErr(true);
              return;
            }
            setDraft({ ...draft, fields, locations: locs });
            navigation.navigate('CreateProcessing');
          }}
        />
      </Anchor>
    </View>
  );
}
