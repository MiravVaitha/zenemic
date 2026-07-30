import React from 'react';
import { ScrollView, View } from 'react-native';
import { FONTS, RADIUS, useTheme } from '../theme';
import { ZenChrome } from '../components/ZenChrome';
import { Section, Anchor } from '../components/Section';
import { ZenText } from '../components/ZenText';
import { ZenButton } from '../components/ZenButton';
import { IconBigCheck, IconCheck } from '../icons';
import { useDraft } from '../navigation/DraftContext';
import type { ResourceCode, ResourceKey, ResourceReport } from '../types/api';
import { ScreenProps } from '../navigation/types';

const PILLS: { key: ResourceKey; label: string }[] = [
  { key: 'chart', label: 'Chart' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'splitter', label: 'Splitter' },
  { key: 'locations', label: 'Locations' },
  { key: 'album', label: 'Album' },
];

/**
 * The skips a host can actually do something about, and where to send them.
 * Codes without an entry (a key missing on the server, a transient failure) are
 * reported but not offered as an action — there's nothing for them to press.
 */
const FIXES: Partial<Record<ResourceCode, { label: string; target: 'EditEvent' | 'Settings' }>> = {
  google_not_connected: { label: 'Connect Google Calendar', target: 'Settings' },
  no_budget: { label: 'Add a budget', target: 'EditEvent' },
  no_one_to_split_with: { label: 'Add guests', target: 'EditEvent' },
  no_start_time: { label: 'Set a date and time', target: 'EditEvent' },
  no_location: { label: 'Add a location', target: 'EditEvent' },
};

export function CreateSuccessScreen({ navigation }: ScreenProps<'CreateSuccess'>) {
  const t = useTheme();
  const { draft } = useDraft();
  const created = draft.created;
  const report = draft.report;
  const title = created?.title ?? draft.fields?.title ?? 'Your event';

  const madeCount = report ? PILLS.filter((p) => report[p.key].status === 'created').length : PILLS.length;
  const shortfall = PILLS.length - madeCount;

  // Rebuild the stack as Events → EventDetail → target, so backing out lands on
  // the event (or the list) and never re-enters the completed create flow, which
  // would re-run CreateProcessing and create a second event.
  const openAt = (target?: 'EditEvent' | 'Settings') => {
    if (!created) {
      navigation.popToTop();
      return;
    }
    const routes = [
      { name: 'Events' as const },
      { name: 'EventDetail' as const, params: { event: created } },
      ...(target === 'Settings'
        ? [{ name: 'Settings' as const }]
        : target === 'EditEvent'
          ? [{ name: 'EditEvent' as const, params: { event: created } }]
          : []),
    ];
    navigation.reset({ index: routes.length - 1, routes });
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <ZenChrome label="EVENT.CREATE" progress={4} total={4} showMenu={false} />
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <Section paddingTop={60} gap={28} style={{ alignItems: 'center' }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              borderWidth: 0.5,
              borderColor: t.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <IconBigCheck color={t.accent} />
          </View>
          <View style={{ alignItems: 'center' }}>
            <ZenText variant="eyebrow" tone="fg3">DONE · 04 / 04</ZenText>
            <ZenText variant="h1" style={{ marginTop: 4, textAlign: 'center' }}>Event ready.</ZenText>
            <ZenText variant="body" style={{ marginTop: 12, textAlign: 'center', maxWidth: 280 }}>
              {shortfall === 0
                ? `${title} is set up with all ${PILLS.length} automated resources.`
                : `${title} is set up with ${madeCount} of ${PILLS.length} automated resources. You can add the rest any time.`}
            </ZenText>
          </View>

          <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 8 }}>
            {PILLS.map(({ key, label }) => (
              <Pill key={key} label={label} made={report ? report[key].status === 'created' : true} />
            ))}
          </View>

          {report ? <Shortfall report={report} onFix={openAt} /> : null}
        </Section>
      </ScrollView>
      <Anchor>
        <ZenButton label="Open event" variant="primary" onPress={() => openAt()} />
        <ZenButton label="Back to events" variant="ghost" onPress={() => navigation.popToTop()} />
      </Anchor>
    </View>
  );
}

function Pill({ label, made }: { label: string; made: boolean }) {
  const t = useTheme();
  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingVertical: 6,
        backgroundColor: made ? t.surface : 'transparent',
        borderWidth: 0.5,
        borderColor: t.hairline,
        borderRadius: RADIUS.pill,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        opacity: made ? 1 : 0.55,
      }}
    >
      {made ? (
        <IconCheck color={t.accent} />
      ) : (
        <View style={{ width: 8, height: 1.5, borderRadius: 1, backgroundColor: t.fg3 }} />
      )}
      <ZenText
        style={{
          fontFamily: FONTS.mono,
          fontSize: 10.5,
          letterSpacing: 1.47,
          textTransform: 'uppercase',
          color: made ? t.fg2 : t.fg3,
        }}
      >
        {label}
      </ZenText>
    </View>
  );
}

/** What didn't happen and why, with a way to fix the ones the host controls. */
function Shortfall({
  report,
  onFix,
}: {
  report: ResourceReport;
  onFix: (target: 'EditEvent' | 'Settings') => void;
}) {
  const t = useTheme();
  const missing = PILLS.map(({ key, label }) => ({ label, outcome: report[key] })).filter(
    (r) => r.outcome.status !== 'created',
  );
  if (!missing.length) return null;

  // One button per destination, in the order the reasons appear.
  const actions: { label: string; target: 'EditEvent' | 'Settings' }[] = [];
  for (const { outcome } of missing) {
    const fix = outcome.code ? FIXES[outcome.code] : undefined;
    if (fix && !actions.some((a) => a.target === fix.target)) actions.push(fix);
  }

  return (
    <View style={{ alignSelf: 'stretch', gap: 12 }}>
      <ZenText variant="eyebrow" tone="fg3">NOT SET UP YET</ZenText>
      <View
        style={{
          borderWidth: 0.5,
          borderColor: t.hairline,
          borderRadius: RADIUS.lg,
          backgroundColor: t.surface,
          overflow: 'hidden',
        }}
      >
        {missing.map(({ label, outcome }, i) => (
          <View
            key={label}
            style={{
              paddingHorizontal: 16,
              paddingVertical: 12,
              gap: 3,
              borderBottomWidth: i < missing.length - 1 ? 0.5 : 0,
              borderBottomColor: t.hairline,
            }}
          >
            <ZenText style={{ fontSize: 14.5, color: t.fg }}>{label}</ZenText>
            {outcome.reason ? (
              <ZenText variant="body" tone="fg3" style={{ fontSize: 13 }}>{outcome.reason}</ZenText>
            ) : null}
          </View>
        ))}
      </View>
      {actions.map((a) => (
        <ZenButton key={a.target} label={a.label} variant="ghost" onPress={() => onFix(a.target)} />
      ))}
    </View>
  );
}
